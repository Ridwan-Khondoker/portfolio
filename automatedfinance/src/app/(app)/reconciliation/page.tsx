import { requirePageUser } from '@/lib/server/auth';
import { hasRole } from '@/lib/security/roles';
import { loadChecks, loadSheetSnapshots, loadState } from '@/lib/server/state';
import { runChecks } from '@/lib/finance/reconciliation';
import { fmtUsd } from '@/lib/money';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ActionForm, Submit } from '@/components/ui/ActionForm';
import { explainCheck } from './actions';

export const metadata = { title: 'Reconciliation' };

export default async function ReconciliationPage() {
  const user = await requirePageUser();
  const isAdmin = hasRole(user.role, 'ADMIN');
  const [state, checks, sheets] = await Promise.all([loadState(), loadChecks(), loadSheetSnapshots()]);
  const results = runChecks({ checks, rows: state.rows, revenue: state.revenue, sheets });
  const counts = { OK: 0, EXPLAINED: 0, CHECK: 0 };
  for (const r of results) counts[r.status]++;

  return (
    <div>
      <h1 className="text-2xl font-semibold">Reconciliation</h1>
      <p className="mt-1 text-sm text-body">
        Imported totals tied out live against the total rows inside each source tab and against the P&amp;L tabs. Source totals are read from the cells of the latest import; cells holding errors are never trusted.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone="green">OK {counts.OK}</Badge>
        <Badge tone="blue">Explained {counts.EXPLAINED}</Badge>
        <Badge tone={counts.CHECK ? 'red' : 'neutral'}>Check {counts.CHECK}</Badge>
      </div>
      <Card className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-[12.5px]">
            <thead className="text-left text-body">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-semibold">Check</th>
                <th className="py-2 pr-3 font-semibold">Period</th>
                <th className="py-2 pr-3 text-right font-semibold">Imported total</th>
                <th className="py-2 pr-3 text-right font-semibold">Source total</th>
                <th className="py-2 pr-3 text-right font-semibold">Difference</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 font-semibold">Source cells · explanation</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id} className="border-b border-line-soft align-top">
                  <td className="py-2 pr-3 text-ink">{r.name}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{r.periodLabel}</td>
                  <td className="tabular py-2 pr-3 text-right">{fmtUsd(r.master, { cents: true })}</td>
                  <td className="tabular py-2 pr-3 text-right">{r.source === null ? '–' : fmtUsd(r.source, { cents: true })}</td>
                  <td className="tabular py-2 pr-3 text-right">{r.difference === null ? '–' : r.difference === 0 ? '0' : fmtUsd(r.difference, { cents: true })}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={r.status === 'OK' ? 'green' : r.status === 'EXPLAINED' ? 'blue' : 'red'}>{r.status}</Badge>
                  </td>
                  <td className="py-2">
                    <span className="block font-mono text-[11px] text-muted">{r.sourceLabel}</span>
                    {r.problem && <span className="mt-1 block text-danger">{r.problem}</span>}
                    {r.explanation && <span className="mt-1 block">{r.explanation}</span>}
                    {isAdmin && r.status === 'CHECK' && r.difference !== null && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[12px] text-amber-strong">Explain this difference</summary>
                        <ActionForm action={explainCheck} className="mt-1 flex flex-wrap gap-1.5">
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="difference" value={String(r.difference)} />
                          <input name="explanation" placeholder="Why the totals differ" aria-label="Explanation" className="w-72 rounded-md border border-line px-1.5 py-1" defaultValue={r.explanation ?? ''} />
                          <Submit size="sm" variant="ghost">
                            Save
                          </Submit>
                        </ActionForm>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">OK = totals agree to the cent. Explained = the difference is exactly one an admin has explained. Check = needs review (or the difference changed since it was explained).</p>
      </Card>
    </div>
  );
}
