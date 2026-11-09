'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requestMeta, requireActionUser } from '@/lib/server/auth';
import { run, str } from '@/lib/server/actions';
import { analyzeIntoBatch, BatchError, commitBatch, createPreview, discardBatch, rollbackBatch, saveMapping, type StoredPlan } from '@/lib/server/imports';
import { syncSource } from '@/lib/server/google-sync';
import { audit } from '@/lib/security/audit';
import type { GridConfig } from '@/lib/importer/types';
import type { ActionResult } from '@/components/ui/ActionForm';

const MAX_BYTES = 20 * 1024 * 1024;

export async function uploadAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let batchId = '';
  const result = await run(async () => {
    const user = await requireActionUser('EDITOR');
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Error('Choose an .xlsx or .csv file.');
    if (file.size > MAX_BYTES) throw new Error('That file is larger than 20 MB.');
    if (!/\.(xlsx|csv)$/i.test(file.name)) throw new Error('Only .xlsx and .csv files can be imported.');
    const buffer = Buffer.from(await file.arrayBuffer());
    const looksXlsx = buffer.subarray(0, 2).toString('latin1') === 'PK';
    if (/\.xlsx$/i.test(file.name) && !looksXlsx) throw new Error('That file is not a valid .xlsx workbook.');
    const year = Number(str(fd, 'year')) || null;
    const res = await createPreview({ buffer, fileName: file.name, origin: 'UPLOAD', userId: user.userId, options: { yearForUndatedTabs: year }, mime: file.type });
    await audit({ action: 'upload', userId: user.userId, target: file.name, details: { batchId: res.batchId, size: file.size }, ...(await requestMeta()) });
    batchId = res.batchId;
  });
  if (batchId) redirect(`/upload/${batchId}`);
  return result;
}

export async function commitAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireActionUser('EDITOR');
    const id = str(fd, 'batchId');
    try {
      const r = await commitBatch(id, user.userId, { ...(await requestMeta()), allowErrors: str(fd, 'allowErrors') === 'on' });
      revalidatePath('/', 'layout');
      return { ok: true, message: `Imported: ${r.added} added, ${r.changed} changed, ${r.removed} removed. Every page now reflects it.` };
    } catch (e) {
      if (e instanceof BatchError) return { ok: false, message: e.message };
      throw e;
    }
  });
}

export async function discardAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireActionUser('EDITOR');
    await discardBatch(str(fd, 'batchId'), user.userId);
    revalidatePath('/upload');
    return { ok: true, message: 'Discarded. Nothing was imported.' };
  });
}

export async function rollbackAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireActionUser('ADMIN');
    try {
      await rollbackBatch(str(fd, 'batchId'), user.userId, await requestMeta());
    } catch (e) {
      if (e instanceof BatchError) return { ok: false, message: e.message };
      throw e;
    }
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Rolled back. The previous values are restored.' };
  });
}

export async function setYearAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requireActionUser('EDITOR');
    const id = str(fd, 'batchId');
    const year = Number(str(fd, 'year'));
    if (!(year >= 2000 && year <= 2100)) throw new Error('Choose a year.');
    const b = await prisma.importBatch.findUniqueOrThrow({ where: { id } });
    await prisma.importBatch.update({ where: { id }, data: { options: { ...((b.options as object) ?? {}), yearForUndatedTabs: year } } });
    await analyzeIntoBatch(id);
    revalidatePath(`/upload/${id}`);
    return { ok: true, message: `Re-checked with ${year} for tabs without a year in their name.` };
  });
}

/** The mapping step for one block: saved as a layout profile, then the batch is analysed again. */
export async function mappingAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireActionUser('EDITOR');
    const id = str(fd, 'batchId');
    const signature = str(fd, 'signature');
    const tab = str(fd, 'tab');
    const b = await prisma.importBatch.findUniqueOrThrow({ where: { id } });
    const plan = b.plan as unknown as StoredPlan;
    const req = plan.analysis.mappings.find((m) => m.tab === tab && m.signature === signature);
    if (!req) throw new Error('That block no longer needs mapping.');
    const blockType = str(fd, 'blockType');
    const base: GridConfig = { ...req.suggestion, title: req.title, catCol: req.catCol, itemCol: req.itemCol, monthCols: req.monthCols };
    let config: GridConfig;
    if (blockType === 'skip') {
      config = { ...base, skip: true, skipReason: str(fd, 'skipReason') || 'Marked “do not import” in the mapping step' };
    } else {
      const first = Number(str(fd, 'firstRow'));
      const last = Number(str(fd, 'lastRow'));
      const year = Number(str(fd, 'year'));
      const department = str(fd, 'department');
      if (!(first > req.headerRow) || !(last >= first)) throw new Error('Choose the first and last expense rows (below the header row).');
      if (!(year >= 2000 && year <= 2100)) throw new Error('Choose the year this block covers.');
      if (!department) throw new Error('Choose the business.');
      const roles: Record<string, [string, GridConfig['countRole']]> = {
        recorded: ['Recorded (source grid)', 'ALWAYS'],
        estimate: ['Estimate (budget block)', 'ESTIMATE'],
        actual: ['Actual', 'ACTUAL'],
        summary: ['Summary (no line detail)', 'ALWAYS'],
      };
      const [recordType, countRole] = roles[blockType] ?? roles.recorded!;
      const rowLabel = (r: number) => {
        const row = req.rows.find((x) => x.row === r);
        return row ? `${row.category}|${row.item}` : '';
      };
      const markerRow = req.rows.find((r) => r.row > last && (r.category || r.item));
      const triggers = fd.getAll('trigger').map(String).map(Number).filter((r) => r >= first && r <= last).map(rowLabel).filter(Boolean);
      if (countRole === 'ACTUAL' && !triggers.length) throw new Error('For an Actual block, tick the payroll rows that decide whether a month uses actual or estimate figures.');
      config = {
        ...base,
        skip: false,
        department,
        year,
        recordType,
        countRole,
        countGroup: countRole === 'ALWAYS' ? undefined : str(fd, 'countGroup') || base.countGroup || tab.replace(/\s*20\d{2}\s*/, ' ').trim(),
        triggerLines: countRole === 'ACTUAL' ? triggers : undefined,
        firstOffset: first - req.headerRow,
        lastOffset: last - req.headerRow,
        endMarker: markerRow ? { label: (markerRow.category || markerRow.item).trim(), offset: markerRow.row - req.headerRow } : undefined,
        idPrefix: str(fd, 'idPrefix') || base.idPrefix,
      };
    }
    await saveMapping({ tab, signature, config, userId: user.userId });
    await analyzeIntoBatch(id);
    revalidatePath(`/upload/${id}`);
    return { ok: true, message: 'Layout saved. The next upload of this tab will import with no questions.' };
  });
}

export async function syncNowAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireActionUser('EDITOR');
    const r = await syncSource(str(fd, 'sourceId'), user.userId);
    revalidatePath('/', 'layout');
    return { ok: r.status !== 'Failed', message: `${r.status}: ${r.message}` };
  });
}
