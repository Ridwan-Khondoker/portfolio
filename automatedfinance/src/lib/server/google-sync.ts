// Google Sheets auto-sync: export each configured sheet as .xlsx with a service account (shared as Viewer) and run it
// through the same importer as an upload. Auto-commits only when there are no validation errors, no unmapped tabs and
// no business-month changes by more than the configured threshold; otherwise the batch is HELD for an Editor.
import crypto from 'node:crypto';
import { JWT } from 'google-auth-library';
import { prisma } from '@/lib/db';
import { googleServiceAccount } from '@/lib/env';
import { audit } from '@/lib/security/audit';
import { commitBatch, createPreview } from './imports';
import { loadAppSettings } from './data';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function serviceAccountEmail(): string | null {
  return googleServiceAccount()?.client_email ?? null;
}

export function parseSheetId(input: string): string | null {
  const t = input.trim();
  const m = t.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  if (m) return m[1]!;
  return /^[A-Za-z0-9_-]{20,}$/.test(t) ? t : null;
}

async function exportSheet(sheetId: string): Promise<{ buffer: Buffer; name: string }> {
  const sa = googleServiceAccount();
  if (!sa) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set.');
  const client = new JWT({ email: sa.client_email, key: sa.private_key, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const meta = await client.request<{ name: string }>({ url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sheetId)}?fields=name&supportsAllDrives=true` });
  const res = await client.request<ArrayBuffer>({
    url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sheetId)}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`,
    responseType: 'arraybuffer',
  });
  return { buffer: Buffer.from(res.data), name: `${meta.data.name || sheetId}.xlsx` };
}

function errorMessage(err: unknown): string {
  const e = err as { response?: { status?: number }; message?: string };
  if (e.response?.status === 404) return 'Sheet not found, or not shared with the service account (share it as Viewer).';
  if (e.response?.status === 403) return 'Access denied: share the sheet with the service account email as Viewer.';
  return (e.message || 'Sync failed').slice(0, 300);
}

export async function syncSource(sourceId: string, userId: string | null = null): Promise<{ status: string; message: string; batchId?: string }> {
  const source = await prisma.googleSheetSource.findUniqueOrThrow({ where: { id: sourceId } });
  const app = await loadAppSettings();
  let status = 'Failed';
  let message = '';
  let batchId: string | undefined;
  try {
    const { buffer, name } = await exportSheet(source.sheetId);
    const sha = crypto.createHash('sha256').update(buffer).digest('hex');
    const last = source.lastBatchId ? await prisma.importBatch.findUnique({ where: { id: source.lastBatchId }, include: { sourceFile: { select: { sha256: true } } } }) : null;
    if (last?.sourceFile?.sha256 === sha && last.status === 'COMMITTED') {
      status = 'No changes';
      message = 'The sheet has not changed since the last sync.';
    } else {
      const preview = await createPreview({ buffer, fileName: name, origin: 'GOOGLE_SYNC', userId, options: { yearForUndatedTabs: source.year }, googleSourceId: source.id, mime: XLSX_MIME });
      batchId = preview.batchId;
      const s = preview.summary;
      const c = s.diff.counts;
      const changes = c.added + c.changed + c.removed + c.factsAdded + c.factsChanged + c.factsRemoved;
      const threshold = Number(app.autoCommitThreshold) || 0.25;
      if (changes === 0 && !s.errors && !s.needsMapping) {
        // Nothing changed: drop the empty batch and its stored copy so the history only shows real changes.
        const b = await prisma.importBatch.delete({ where: { id: batchId } });
        if (b.sourceFileId) await prisma.sourceFile.deleteMany({ where: { id: b.sourceFileId, batches: { none: {} } } });
        batchId = undefined;
        status = 'No changes';
        message = 'Synced; nothing changed.';
      } else {
        const reasons: string[] = [];
        if (s.errors) reasons.push(`${s.errors} validation error(s)`);
        if (s.needsMapping) reasons.push(`${s.needsMapping} new block(s) need a mapping step`);
        if (s.diff.maxPctChange >= threshold) reasons.push(`a business-month changed by ${(s.diff.maxPctChange * 100).toFixed(0)}% (threshold ${(threshold * 100).toFixed(0)}%)`);
        const droppedToZero = s.diff.totals.some((t) => t.before !== 0 && t.after === 0);
        if (droppedToZero && !reasons.some((r) => r.includes('changed by'))) reasons.push('a business-month dropped to zero');
        if (reasons.length) {
          await prisma.importBatch.update({ where: { id: batchId }, data: { status: 'HELD', heldReason: `Held for review: ${reasons.join('; ')}.` } });
          status = 'Held for review';
          message = reasons.join('; ');
        } else {
          const r = await commitBatch(batchId, userId);
          status = 'Committed';
          message = `${r.added} added, ${r.changed} changed, ${r.removed} removed.`;
        }
      }
    }
  } catch (err) {
    status = 'Failed';
    message = errorMessage(err);
  }
  await prisma.googleSheetSource.update({
    where: { id: source.id },
    data: { lastSyncAt: new Date(), lastStatus: status, lastMessage: message, ...(batchId ? { lastBatchId: batchId } : {}) },
  });
  await audit({ action: 'sync.run', userId, target: source.label, details: { status, message, batchId: batchId ?? null } });
  return { status, message, batchId };
}

/** Runs every enabled source whose interval has elapsed. Guarded by a Postgres advisory lock so only one runner works at a time. */
export async function syncDue(force = false): Promise<{ ran: number; skipped: string | null }> {
  if (!googleServiceAccount()) return { ran: 0, skipped: 'Google service account not configured' };
  const app = await loadAppSettings();
  if (!force && app.syncEnabled === false) return { ran: 0, skipped: 'Sync disabled in Settings' };
  const [{ locked }] = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(424242) AS locked`;
  if (!locked) return { ran: 0, skipped: 'Another sync is running' };
  try {
    const intervalMs = Math.max(5, Number(app.syncIntervalMinutes) || 15) * 60_000;
    const sources = await prisma.googleSheetSource.findMany({ where: { enabled: true } });
    let ran = 0;
    for (const s of sources) {
      if (!force && s.lastSyncAt && Date.now() - s.lastSyncAt.getTime() < intervalMs - 30_000) continue;
      await syncSource(s.id, null);
      ran++;
    }
    return { ran, skipped: null };
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(424242)`;
  }
}
