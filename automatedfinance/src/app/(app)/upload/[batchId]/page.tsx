import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePageUser } from '@/lib/server/auth';
import { hasRole } from '@/lib/security/roles';
import { loadRefData } from '@/lib/server/data';
import type { BatchSummary, StoredPlan } from '@/lib/server/imports';
import { fmtUsd, fmtPct } from '@/lib/money';
import { monthLabel } from '@/lib/months';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Badge, BATCH_TONE as STATUS_TONE } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/Button';
import { Alert, inputClass } from '@/components/ui/Field';
import { ActionForm, Submit } from '@/components/ui/ActionForm';
import { commitAction, discardAction, mappingAction, rollbackAction, setYearAction } from '../actions';

export const metadata = { title: 'Review import' };

const amt = (v: string | null) => (v === null ? '–' : /^-?\d+(\.\d+)?$/.test(v) ? fmtUsd(Number(v), { cents: true }) : `“${v}”`);

export default async function BatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const user = await requirePageUser('EDITOR');
  const isAdmin = hasRole(user.role, 'ADMIN');
  const { batchId } = await params;
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, include: { sourceFile: { select: { id: true, filename: true, sha256: true, size: true } } } });
  if (!batch) notFound();
  const plan = batch.plan as unknown as StoredPlan | null;
  const summary = batch.summary as unknown as (BatchSummary & { applied?: { added: number; changed: number; removed: number; factsChanged: number } }) | null;
  const ref = await loadRefData();
  const pending = batch.status === 'PREVIEW' || batch.status === 'HELD';
  const a = plan?.analysis;
  const errors = a?.issues.filter((i) => i.level === 'error') ?? [];
  const warnings = a?.issues.filter((i) => i.level === 'warning') ?? [];
  const d = summary?.diff;
  const options = (batch.options ?? {}) as { yearForUndatedTabs?: number | null };

  return (
    <div>
      <Link href="/upload" className="text-[13px] text-amber-strong hover:underline">
        ← Upload &amp; sync
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{batch.label}</h1>
        <Badge tone={STATUS_TONE[batch.status]}>{batch.status.replace('_', ' ').toLowerCase()}</Badge>
      </div>
      <p className="mt-1 text-[13px] text-muted">
        {batch.origin === 'GOOGLE_SYNC' ? 'Google sync' : batch.origin === 'MANUAL' ? 'Manual entry' : batch.origin === 'SEED' ? 'Initial import' : 'Upload'} ·{' '}
        {batch.createdAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' })} ET
        {batch.sourceFile && (
          <>
            {' · '}
            {(batch.sourceFile.size / 1024).toFixed(0)} KB · SHA-256 <span className="font-mono">{batch.sourceFile.sha256.slice(0, 12)}…</span>
            {isAdmin && (
              <>
                {' · '}
                <a className="text-amber-strong hover:underline" href={`/api/files/${batch.sourceFile.id}`}>
                  Download original
                </a>
              </>
            )}
          </>
        )}
      </p>
      {batch.heldReason && (
        <div className="mt-3">
          <Alert tone="warn">{batch.heldReason}</Alert>
        </div>
      )}

      {a && (
        <>
          <SectionTitle sub="What each tab was recognised as">Tabs</SectionTitle>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[12.5px]">
                <thead className="text-left text-body">
                  <tr className="border-b border-line">
                    <th className="py-1.5 pr-2 font-semibold">Tab</th>
                    <th className="py-1.5 pr-2 font-semibold">Recognised as</th>
                    <th className="py-1.5 pr-2 font-semibold">Year</th>
                    <th className="py-1.5 pr-2 font-semibold">Rows</th>
                    <th className="py-1.5 pr-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {a.tabs.map((t) => (
                    <tr key={t.tab} className="border-b border-line-soft align-top">
                      <td className="py-1.5 pr-2 font-semibold text-ink">{t.tab}</td>
                      <td className="py-1.5 pr-2">
                        {t.kind ?? '–'}
                        {t.blocks.map((b) => (
                          <span key={b.signature} className="block text-[11.5px] text-muted">
                            Row {b.headerRow}: {b.title || 'block'} → {b.status === 'imported' ? b.profileName : b.status === 'skipped' ? `not imported (${b.reason})` : b.status === 'needs-mapping' ? 'needs mapping' : b.reason}
                          </span>
                        ))}
                      </td>
                      <td className="py-1.5 pr-2">{t.year ?? '–'}</td>
                      <td className="tabular py-1.5 pr-2">{t.expenses || t.facts ? `${t.expenses} expense, ${t.facts} other` : '–'}</td>
                      <td className="py-1.5 pr-2">
                        <Badge tone={t.status === 'imported' ? 'green' : t.status === 'needs-mapping' ? 'amber' : t.status === 'error' ? 'red' : 'neutral'}>{t.status === 'needs-mapping' ? 'needs mapping' : t.status}</Badge>
                        {t.reason && <span className="block text-[11.5px] text-muted">{t.reason}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pending && (
              <ActionForm action={setYearAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                <input type="hidden" name="batchId" value={batch.id} />
                <label className="text-xs font-semibold text-body">
                  Year for tabs with no year in their name
                  <input name="year" type="number" min={2000} max={2100} defaultValue={options.yearForUndatedTabs ?? ''} placeholder="saved layout year" className={`${inputClass} mt-1 w-40`} />
                </label>
                <Submit size="sm" variant="ghost">
                  Re-check
                </Submit>
              </ActionForm>
            )}
          </Card>

          {pending && a.mappings.length > 0 && (
            <>
              <SectionTitle sub="Seen for the first time. Saved as a layout so the next upload asks nothing.">Mapping step</SectionTitle>
              <div className="space-y-3">
                {a.mappings.map((m) => (
                  <Card key={m.tab + m.signature} title={`${m.tab} · row ${m.headerRow}: ${m.title || 'block'}`} note={m.suggestionSource ? `Pre-filled from the saved layout “${m.suggestionSource}”.` : 'Pre-filled with best guesses: check each field.'}>
                    <ActionForm action={mappingAction} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                      <input type="hidden" name="batchId" value={batch.id} />
                      <input type="hidden" name="tab" value={m.tab} />
                      <input type="hidden" name="signature" value={m.signature} />
                      <div className="grid grid-cols-2 content-start gap-3">
                        <label className="col-span-2 text-xs font-semibold text-body">
                          Block type
                          <select name="blockType" className={`${inputClass} mt-1`} defaultValue={m.suggestion.skip ? 'skip' : m.suggestion.countRole === 'ESTIMATE' ? 'estimate' : m.suggestion.countRole === 'ACTUAL' ? 'actual' : m.suggestion.recordType.startsWith('Summary') ? 'summary' : 'recorded'}>
                            <option value="recorded">Recorded expenses (counted)</option>
                            <option value="estimate">Estimate (counted only in months without actuals)</option>
                            <option value="actual">Actual (replaces the estimate in months with payroll)</option>
                            <option value="summary">Summary totals (no line detail)</option>
                            <option value="skip">Do not import this block</option>
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-body">
                          Business
                          <select name="department" className={`${inputClass} mt-1`} defaultValue={m.suggestion.department}>
                            {ref.departments.map((dep) => (
                              <option key={dep}>{dep}</option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-body">
                          Year
                          <input name="year" type="number" min={2000} max={2100} defaultValue={m.suggestion.year ?? ''} className={`${inputClass} mt-1`} />
                        </label>
                        <label className="text-xs font-semibold text-body">
                          First expense row
                          <select name="firstRow" className={`${inputClass} mt-1`} defaultValue={m.headerRow + m.suggestion.firstOffset}>
                            {m.rows.map((r) => (
                              <option key={r.row} value={r.row}>
                                {r.row}: {r.category || r.item || '(blank)'}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-body">
                          Last expense row
                          <select name="lastRow" className={`${inputClass} mt-1`} defaultValue={m.headerRow + m.suggestion.lastOffset}>
                            {m.rows.map((r) => (
                              <option key={r.row} value={r.row}>
                                {r.row}: {r.category || r.item || '(blank)'}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-body">
                          Estimate/actual pair name
                          <input name="countGroup" defaultValue={m.suggestion.countGroup ?? ''} placeholder="e.g. LUX LIFE" className={`${inputClass} mt-1`} />
                        </label>
                        <label className="text-xs font-semibold text-body">
                          ID prefix
                          <input name="idPrefix" defaultValue={m.suggestion.idPrefix ?? ''} className={`${inputClass} mt-1`} />
                        </label>
                        <div className="col-span-2">
                          <Submit variant="brand">Save layout and re-check</Submit>
                        </div>
                      </div>
                      <div className="max-h-[360px] overflow-auto rounded-xl border border-line">
                        <table className="w-full text-[12px]">
                          <thead className="sticky top-0 bg-kraft text-left text-body">
                            <tr>
                              <th className="px-2 py-1 font-semibold">Row</th>
                              <th className="px-2 py-1 font-semibold">Category</th>
                              <th className="px-2 py-1 font-semibold">Item</th>
                              <th className="px-2 py-1 font-semibold">First values</th>
                              <th className="px-2 py-1 font-semibold" title="Actual blocks: rows that decide actual vs estimate">Payroll?</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.rows.map((r) => (
                              <tr key={r.row} className="border-t border-line-soft">
                                <td className="px-2 py-1 text-muted">{r.row}</td>
                                <td className="px-2 py-1">{r.category}</td>
                                <td className="px-2 py-1">{r.item}</td>
                                <td className="px-2 py-1 text-muted">{r.sample}</td>
                                <td className="px-2 py-1">
                                  {(r.category || r.item) && <input type="checkbox" name="trigger" value={r.row} defaultChecked={m.suggestion.triggerLines?.includes(`${r.category}|${r.item}`)} aria-label={`Row ${r.row} is payroll`} />}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </ActionForm>
                  </Card>
                ))}
              </div>
            </>
          )}

          {(errors.length > 0 || warnings.length > 0) && (
            <>
              <SectionTitle sub={`${errors.length} errors · ${warnings.length} warnings`}>Validation</SectionTitle>
              <Card>
                <ul className="space-y-1 text-[13px]">
                  {errors.map((i, k) => (
                    <li key={`e${k}`} className="text-danger">
                      <Badge tone="red">Error</Badge> {i.message}
                    </li>
                  ))}
                  {warnings.slice(0, 200).map((i, k) => (
                    <li key={`w${k}`}>
                      <Badge tone="amber">Warning</Badge> {i.message}
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </>
      )}

      {d && (
        <>
          <SectionTitle sub={pending ? 'What will change if you import this file' : 'What this batch changed'}>Changes</SectionTitle>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              ['Rows added', d.counts.added],
              ['Amounts or details changed', d.counts.changed],
              ['Rows no longer in the sheet', d.counts.removed],
              ['Unchanged', d.counts.unchanged],
            ].map(([label, n]) => (
              <div key={label} className="rounded-xl border border-line px-3.5 py-3">
                <p className="text-xs font-semibold text-body">{label}</p>
                <p className="tabular font-display text-2xl font-semibold text-ink">{Number(n).toLocaleString()}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Other facts (revenue, recurring list, domains, snapshots, source totals): {d.counts.factsAdded} added, {d.counts.factsChanged} changed, {d.counts.factsRemoved} removed.
          </p>

          {d.totals.length > 0 && (
            <Card title="Effect on counted totals by business and month" className="mt-3">
              <div className="max-h-[360px] overflow-auto">
                <table className="w-full min-w-[560px] text-[12.5px]">
                  <thead className="sticky top-0 bg-paper text-left text-body">
                    <tr className="border-b border-line">
                      <th className="py-1.5 pr-2 font-semibold">Business</th>
                      <th className="py-1.5 pr-2 font-semibold">Month</th>
                      <th className="py-1.5 pr-2 text-right font-semibold">Before</th>
                      <th className="py-1.5 pr-2 text-right font-semibold">After</th>
                      <th className="py-1.5 pr-2 text-right font-semibold">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.totals.map((t) => (
                      <tr key={t.department + t.month} className="border-b border-line-soft">
                        <td className="py-1 pr-2">{t.department}</td>
                        <td className="py-1 pr-2">{monthLabel(t.month, true)}</td>
                        <td className="tabular py-1 pr-2 text-right">{fmtUsd(t.before, { cents: true })}</td>
                        <td className="tabular py-1 pr-2 text-right">{fmtUsd(t.after, { cents: true })}</td>
                        <td className="tabular py-1 pr-2 text-right text-ink">
                          {t.delta > 0 ? '+' : ''}
                          {fmtUsd(t.delta, { cents: true })}
                          {t.pct !== null && <span className="text-muted"> ({fmtPct(t.pct, 1, true)})</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {d.rows.length > 0 && (
            <Card title="Row changes" className="mt-3" note={d.rows.length >= 2000 ? 'Showing the first 2,000 changes.' : undefined}>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full min-w-[760px] text-[12.5px]">
                  <thead className="sticky top-0 bg-paper text-left text-body">
                    <tr className="border-b border-line">
                      <th className="py-1.5 pr-2 font-semibold">Change</th>
                      <th className="py-1.5 pr-2 font-semibold">Cell</th>
                      <th className="py-1.5 pr-2 font-semibold">Business</th>
                      <th className="py-1.5 pr-2 font-semibold">Month</th>
                      <th className="py-1.5 pr-2 font-semibold">Line</th>
                      <th className="py-1.5 pr-2 text-right font-semibold">Old → new</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.key + r.change} className="border-b border-line-soft">
                        <td className="py-1 pr-2">
                          <Badge tone={r.change === 'added' ? 'green' : r.change === 'removed' ? 'red' : 'amber'}>{r.change}</Badge>
                        </td>
                        <td className="py-1 pr-2 font-mono text-[11px]">{r.cell ?? '–'}</td>
                        <td className="py-1 pr-2">{r.department}</td>
                        <td className="py-1 pr-2 whitespace-nowrap">{r.month ? monthLabel(r.month) : '–'}</td>
                        <td className="py-1 pr-2">
                          {r.description}
                          {r.fields && r.fields.some((f) => f !== 'amount') && <span className="block text-[11px] text-muted">changed: {r.fields.join(', ')}</span>}
                        </td>
                        <td className="tabular py-1 pr-2 text-right whitespace-nowrap">
                          {r.change === 'added' ? amt(r.newAmount) : r.change === 'removed' ? amt(r.oldAmount) : `${amt(r.oldAmount)} → ${amt(r.newAmount)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {pending && (
        <div className="sticky bottom-3 mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-paper/95 p-3 shadow-[var(--shadow-card)] backdrop-blur">
          <ActionForm action={commitAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="batchId" value={batch.id} />
            {errors.length > 0 && (
              <label className="flex items-center gap-1.5 text-[13px] text-danger">
                <input type="checkbox" name="allowErrors" /> Import anyway (error cells are not imported as amounts)
              </label>
            )}
            <Submit variant="brand" confirm={a?.mappings.length ? undefined : 'Import these changes now?'}>
              {a?.mappings.length ? 'Finish the mapping step first' : 'Import'}
            </Submit>
          </ActionForm>
          <ActionForm action={discardAction}>
            <input type="hidden" name="batchId" value={batch.id} />
            <Submit variant="ghost" confirm="Discard? Nothing will be imported.">
              Discard
            </Submit>
          </ActionForm>
          <Link href="/upload" className={buttonClass('link', 'sm')}>
            Back
          </Link>
        </div>
      )}
      {isAdmin && batch.status === 'COMMITTED' && (
        <div className="mt-5">
          <ActionForm action={rollbackAction}>
            <input type="hidden" name="batchId" value={batch.id} />
            <Submit variant="danger" confirm="Roll back this batch? Its rows return to the values before it.">
              Roll back this batch
            </Submit>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
