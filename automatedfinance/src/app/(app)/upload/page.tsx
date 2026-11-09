import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requirePageUser } from '@/lib/server/auth';
import { hasRole } from '@/lib/security/roles';
import { serviceAccountEmail } from '@/lib/server/google-sync';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Badge, BATCH_TONE as STATUS_TONE } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Field';
import { ActionForm, Submit } from '@/components/ui/ActionForm';
import { Dropzone } from '@/components/upload/Dropzone';
import { discardAction, rollbackAction, syncNowAction } from './actions';

export const metadata = { title: 'Upload & sync' };

const when = (d: Date | null) => (d ? d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }) + ' ET' : '–');

export default async function UploadPage() {
  const user = await requirePageUser('EDITOR');
  const isAdmin = hasRole(user.role, 'ADMIN');
  const [batches, sources, users] = await Promise.all([
    prisma.importBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 60, select: { id: true, status: true, origin: true, label: true, createdAt: true, committedAt: true, createdById: true, committedById: true, summary: true, heldReason: true } }),
    prisma.googleSheetSource.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.user.findMany({ select: { id: true, email: true } }),
  ]);
  const who = new Map(users.map((u) => [u.id, u.email]));
  const pending = batches.filter((b) => b.status === 'PREVIEW' || b.status === 'HELD');
  const sa = serviceAccountEmail();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Upload &amp; sync</h1>
        <a className={buttonClass('ghost', 'sm')} href="/api/template">
          Download blank Expense Entry template
        </a>
      </div>
      <p className="mt-1 text-sm text-body">
        Upload the company workbook (or any future year’s copy) or an Expense Entry list. You’ll see exactly what changes before anything is saved, and every import can be rolled back.
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-[3fr_2fr]">
        <Card title="Upload a sheet">
          <Dropzone thisYear={new Date().getUTCFullYear()} />
        </Card>
        <Card title="Google Sheets auto-sync" note={isAdmin ? 'Add or change sheets in Settings → Google sync.' : undefined}>
          {!sa ? (
            <Alert tone="info">Not configured: an admin needs to set the GOOGLE_SERVICE_ACCOUNT_JSON variable on the server.</Alert>
          ) : sources.length === 0 ? (
            <p className="text-sm text-muted">No sheets connected yet.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {sources.map((s) => (
                <li key={s.id} className="py-2 text-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-ink">
                      {s.label}
                      {s.year ? ` · ${s.year}` : ''}
                      {!s.enabled && <span className="text-muted"> (paused)</span>}
                    </span>
                    <ActionForm action={syncNowAction}>
                      <input type="hidden" name="sourceId" value={s.id} />
                      <Submit size="sm" variant="ghost">
                        Sync now
                      </Submit>
                    </ActionForm>
                  </div>
                  <p className="text-muted">
                    Last sync {when(s.lastSyncAt)} · {s.lastStatus ?? 'never run'}
                    {s.lastMessage ? ` · ${s.lastMessage}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {pending.length > 0 && (
        <>
          <SectionTitle sub="Not saved yet: review, then import or discard">Waiting for review</SectionTitle>
          <div className="space-y-2">
            {pending.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-ring bg-amber-soft/50 px-4 py-3 text-[13px]">
                <span>
                  <Badge tone={STATUS_TONE[b.status]}>{b.status === 'HELD' ? 'Held' : 'Preview'}</Badge> <strong className="text-ink">{b.label}</strong> · {b.origin === 'GOOGLE_SYNC' ? 'Google sync' : 'upload'} · {when(b.createdAt)}
                  {b.heldReason && <span className="block text-muted">{b.heldReason}</span>}
                </span>
                <span className="flex gap-2">
                  <Link className={buttonClass('primary', 'sm')} href={`/upload/${b.id}`}>
                    Review
                  </Link>
                  <ActionForm action={discardAction}>
                    <input type="hidden" name="batchId" value={b.id} />
                    <Submit size="sm" variant="ghost" confirm="Discard this batch? Nothing has been imported from it.">
                      Discard
                    </Submit>
                  </ActionForm>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle sub="Newest first">Import history</SectionTitle>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[12.5px]">
            <thead className="text-left text-body">
              <tr className="border-b border-line">
                <th className="py-1.5 pr-2 font-semibold">When</th>
                <th className="py-1.5 pr-2 font-semibold">What</th>
                <th className="py-1.5 pr-2 font-semibold">Source</th>
                <th className="py-1.5 pr-2 font-semibold">By</th>
                <th className="py-1.5 pr-2 font-semibold">Changes</th>
                <th className="py-1.5 pr-2 font-semibold">Status</th>
                <th className="py-1.5 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const applied = (b.summary as { applied?: { added: number; changed: number; removed: number } } | null)?.applied;
                return (
                  <tr key={b.id} className="border-b border-line-soft align-top">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{when(b.committedAt ?? b.createdAt)}</td>
                    <td className="py-1.5 pr-2">
                      <Link href={`/upload/${b.id}`} className="text-ink hover:underline">
                        {b.label}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-2">{{ UPLOAD: 'Upload', GOOGLE_SYNC: 'Google sync', MANUAL: 'Manual entry', SEED: 'Initial import' }[b.origin]}</td>
                    <td className="py-1.5 pr-2">{who.get(b.committedById ?? b.createdById ?? '') ?? (b.origin === 'GOOGLE_SYNC' || b.origin === 'SEED' ? 'system' : '–')}</td>
                    <td className="tabular py-1.5 pr-2">{applied ? `+${applied.added} · ~${applied.changed} · −${applied.removed}` : '–'}</td>
                    <td className="py-1.5 pr-2">
                      <Badge tone={STATUS_TONE[b.status]}>{b.status.replace('_', ' ').toLowerCase()}</Badge>
                    </td>
                    <td className="py-1.5">
                      {isAdmin && b.status === 'COMMITTED' && (
                        <ActionForm action={rollbackAction}>
                          <input type="hidden" name="batchId" value={b.id} />
                          <Submit size="sm" variant="danger" confirm={`Roll back “${b.label}”? Its rows return to the values before this import.`}>
                            Roll back
                          </Submit>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
