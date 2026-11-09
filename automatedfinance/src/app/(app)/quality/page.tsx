import { prisma } from '@/lib/db';
import { requirePageUser } from '@/lib/server/auth';
import { hasRole } from '@/lib/security/roles';
import { loadState } from '@/lib/server/state';
import { flagKey } from '@/lib/finance/derive';
import { fmtUsd } from '@/lib/money';
import { monthLabel } from '@/lib/months';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ActionForm, Submit } from '@/components/ui/ActionForm';
import { resolveFlag, resolveIssue } from './actions';

export const metadata = { title: 'Data quality' };

export default async function QualityPage() {
  const user = await requirePageUser();
  const isAdmin = hasRole(user.role, 'ADMIN');
  const [state, issues, resolutions] = await Promise.all([loadState(), prisma.issueLogItem.findMany({ orderBy: { n: 'asc' } }), prisma.flagResolution.findMany()]);
  const resolved = new Map(resolutions.map((r) => [r.flagKey, r]));
  const flags = state.rows.flatMap((r) => r.flags.map((f) => ({ row: r, flag: f, key: flagKey(r, f) })));
  const open = flags.filter((f) => !resolved.has(f.key));
  const done = flags.filter((f) => resolved.has(f.key));
  const byType = new Map<string, number>();
  for (const f of open) {
    const t = f.flag.replace(/\s*[(“].*$/, '');
    byType.set(t, (byType.get(t) ?? 0) + 1);
  }
  const openIssues = issues.filter((i) => !i.resolved);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Data quality</h1>
      <p className="mt-1 text-sm text-body">Checks run live on every counted row and every manual entry. Source numbers are never changed here: fix them in the sheet and re-import, or record why they are right.</p>

      <SectionTitle sub={`${open.length} open · ${done.length} resolved`}>Flags</SectionTitle>
      {byType.size > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {[...byType.entries()].map(([t, n]) => (
            <Badge key={t} tone="red">
              {t}: {n}
            </Badge>
          ))}
        </div>
      )}
      <Card>
        {open.length === 0 ? (
          <p className="text-sm text-muted">No open flags.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[12.5px]">
              <thead className="text-left text-body">
                <tr className="border-b border-line">
                  <th className="py-1.5 pr-2 font-semibold">Flag</th>
                  <th className="py-1.5 pr-2 font-semibold">Row</th>
                  <th className="py-1.5 pr-2 font-semibold">Business</th>
                  <th className="py-1.5 pr-2 font-semibold">Month</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Amount</th>
                  <th className="py-1.5 pr-2 font-semibold">Source</th>
                  {isAdmin && <th className="py-1.5 font-semibold">Resolve</th>}
                </tr>
              </thead>
              <tbody>
                {open.map((f) => (
                  <tr key={f.key} className="border-b border-line-soft align-top">
                    <td className="py-1.5 pr-2">
                      <Badge tone="red">{f.flag}</Badge>
                    </td>
                    <td className="py-1.5 pr-2">{f.row.description}</td>
                    <td className="py-1.5 pr-2">{f.row.department ?? '–'}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{f.row.month ? monthLabel(f.row.month) : '–'}</td>
                    <td className="tabular py-1.5 pr-2 text-right">{f.row.amountUsd ? fmtUsd(f.row.amountUsd.toNumber(), { cents: true }) : (f.row.rawValue ?? '–')}</td>
                    <td className="py-1.5 pr-2 font-mono text-[11px] text-muted">{f.row.cell ?? f.row.displayId}</td>
                    {isAdmin && (
                      <td className="py-1.5">
                        <ActionForm action={resolveFlag} className="flex gap-1.5">
                          <input type="hidden" name="flagKey" value={f.key} />
                          <input name="note" placeholder="Note" aria-label="Resolution note" className="w-40 rounded-md border border-line px-1.5 py-1" />
                          <Submit size="sm" variant="ghost">
                            Resolve
                          </Submit>
                        </ActionForm>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {done.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Resolved flags ({done.length})</summary>
            <ul className="mt-2 divide-y divide-line-soft text-[12.5px]">
              {done.map((f) => (
                <li key={f.key} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>
                    {f.flag} · {f.row.description} · <span className="text-muted">{resolved.get(f.key)!.note}</span>
                  </span>
                  {isAdmin && (
                    <ActionForm action={resolveFlag}>
                      <input type="hidden" name="flagKey" value={f.key} />
                      <input type="hidden" name="reopen" value="1" />
                      <Submit size="sm" variant="link">
                        Reopen
                      </Submit>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <SectionTitle sub={`${issues.length} items from the source audit · ${openIssues.length} not marked resolved`}>Issues log</SectionTitle>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[12.5px]">
            <thead className="text-left text-body">
              <tr className="border-b border-line">
                <th className="py-1.5 pr-2 font-semibold">#</th>
                <th className="py-1.5 pr-2 font-semibold">Sheet / cell</th>
                <th className="py-1.5 pr-2 font-semibold">Issue</th>
                <th className="py-1.5 pr-2 font-semibold">Action taken</th>
                <th className="py-1.5 pr-2 font-semibold">Status</th>
                {isAdmin && <th className="py-1.5 font-semibold">Resolve</th>}
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => (
                <tr key={i.n} className={`border-b border-line-soft align-top ${i.resolved ? 'text-muted' : ''}`}>
                  <td className="py-1.5 pr-2">{i.n}</td>
                  <td className="py-1.5 pr-2 font-mono text-[11px]">{i.sheetCell}</td>
                  <td className="py-1.5 pr-2">{i.issue}</td>
                  <td className="py-1.5 pr-2">{i.actionTaken}</td>
                  <td className="py-1.5 pr-2">
                    {i.resolved ? (
                      <>
                        <Badge tone="green">Resolved</Badge>
                        <span className="mt-1 block text-[11px]">{i.resolutionNote}</span>
                      </>
                    ) : (
                      <Badge tone={/action|confirm/i.test(i.status) ? 'amber' : /fixed/i.test(i.status) ? 'green' : 'neutral'}>{i.status}</Badge>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="py-1.5">
                      <ActionForm action={resolveIssue} className="flex gap-1.5">
                        <input type="hidden" name="n" value={i.n} />
                        {i.resolved ? (
                          <>
                            <input type="hidden" name="reopen" value="1" />
                            <Submit size="sm" variant="link">
                              Reopen
                            </Submit>
                          </>
                        ) : (
                          <>
                            <input name="note" placeholder="How was it resolved?" aria-label={`Resolution note for issue ${i.n}`} className="w-44 rounded-md border border-line px-1.5 py-1" />
                            <Submit size="sm" variant="ghost">
                              Resolve
                            </Submit>
                          </>
                        )}
                      </ActionForm>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
