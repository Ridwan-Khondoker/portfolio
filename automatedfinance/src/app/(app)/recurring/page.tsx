import { requirePageUser } from '@/lib/server/auth';
import { hasRole } from '@/lib/security/roles';
import { loadAppSettings, financeSettings, loadRefData } from '@/lib/server/data';
import { domainRows, loadRecurring } from '@/lib/server/state';
import { FREQUENCIES } from '@/lib/finance/recurring';
import { fmtUsd } from '@/lib/money';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ActionForm, Submit } from '@/components/ui/ActionForm';
import { saveRecurringMeta } from './actions';

export const metadata = { title: 'Recurring expenses' };

const STATUS_TONE = { Active: 'green', 'Amount unknown': 'amber', 'No amount listed': 'neutral', '$0 / inactive': 'orange' } as const;

export default async function RecurringPage() {
  const user = await requirePageUser();
  const canEdit = hasRole(user.role, 'EDITOR');
  const [app, ref] = await Promise.all([loadAppSettings(), loadRefData()]);
  const settings = financeSettings(app);
  const rec = await loadRecurring(ref.departments);
  const domains = domainRows(rec.domains, settings.asOf, Number(app.domainAlertDays) || 60);
  const snapshotOptions = rec.snapshot.map((s) => ({ key: s.itemKey, label: s.detail ? `${s.name} (${s.detail})` : s.name }));

  return (
    <div>
      <h1 className="text-2xl font-semibold">Recurring expenses</h1>
      <p className="mt-1 text-sm text-body">Subscriptions and services from the current list in the source sheet, with monthly equivalents (amount × payments per month) and the change since the October run-rate snapshot.</p>

      <SectionTitle sub={`${rec.rows.length} items`}>Current list</SectionTitle>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[12.5px]">
            <thead className="text-left text-body">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-semibold">Expense</th>
                <th className="py-2 pr-3 text-right font-semibold">Listed</th>
                <th className="py-2 pr-3 font-semibold">Frequency</th>
                <th className="py-2 pr-3 text-right font-semibold">Monthly equiv.</th>
                <th className="py-2 pr-3 font-semibold">Business</th>
                <th className="py-2 pr-3 text-right font-semibold">October snapshot</th>
                <th className="py-2 pr-3 text-right font-semibold">Change vs Oct</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                {canEdit && <th className="py-2 font-semibold">Adjust</th>}
              </tr>
            </thead>
            <tbody>
              {rec.rows.map((r) => (
                <tr key={r.itemKey} className={`border-b border-line-soft align-top ${r.status !== 'Active' ? 'bg-amber-soft/40' : ''}`}>
                  <td className="py-1.5 pr-3">
                    <span className="text-ink">{r.name}</span>
                    {r.detail && <span className="text-muted"> · {r.detail}</span>}
                    {r.notes && <span className="block text-[11px] text-muted">{r.notes}</span>}
                    <span className="block font-mono text-[10.5px] text-muted">{r.sourceCell}</span>
                  </td>
                  <td className="tabular py-1.5 pr-3 text-right">{r.listed === '' ? '–' : /^-?\d+(\.\d+)?$/.test(r.listed) ? fmtUsd(Number(r.listed), { cents: true }) : r.listed}</td>
                  <td className="py-1.5 pr-3">{r.frequency}</td>
                  <td className="tabular py-1.5 pr-3 text-right text-ink">{fmtUsd(r.monthly, { cents: true })}</td>
                  <td className="py-1.5 pr-3">{r.department}</td>
                  <td className="tabular py-1.5 pr-3 text-right">
                    {r.snapshot ? (
                      <>
                        {r.snapshot.monthly === null ? '–' : fmtUsd(r.snapshot.monthly, { cents: true })}
                        <span className="block text-[11px] text-muted">{r.snapshot.name}</span>
                        {r.snapshot.paymentMethod && <span className="block text-[11px] text-muted">{r.snapshot.paymentMethod}</span>}
                      </>
                    ) : (
                      <span className="text-muted">not in snapshot</span>
                    )}
                  </td>
                  <td className={`tabular py-1.5 pr-3 text-right ${r.changeVsSnapshot && r.changeVsSnapshot > 0 ? 'text-danger' : ''}`}>
                    {r.changeVsSnapshot === null || Math.abs(r.changeVsSnapshot) < 0.005 ? '' : `${r.changeVsSnapshot > 0 ? '+' : ''}${fmtUsd(r.changeVsSnapshot, { cents: true })}`}
                  </td>
                  <td className="py-1.5 pr-3">
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  </td>
                  {canEdit && (
                    <td className="py-1.5">
                      <details>
                        <summary className="cursor-pointer text-[12px] text-amber-strong">Edit</summary>
                        <ActionForm action={saveRecurringMeta} className="mt-2 grid w-64 gap-1.5">
                          <input type="hidden" name="itemKey" value={r.itemKey} />
                          <select name="department" defaultValue={r.department} aria-label="Business" className="rounded-md border border-line px-1.5 py-1">
                            {ref.departments.map((d) => (
                              <option key={d}>{d}</option>
                            ))}
                          </select>
                          <select name="frequency" defaultValue={r.frequency} aria-label="Frequency" className="rounded-md border border-line px-1.5 py-1">
                            {FREQUENCIES.map((f) => (
                              <option key={f.name}>{f.name}</option>
                            ))}
                          </select>
                          <select name="snapshotMatch" defaultValue="__auto" aria-label="October snapshot line" className="rounded-md border border-line px-1.5 py-1">
                            <option value="__auto">Snapshot match: keep / automatic</option>
                            <option value="">No match in snapshot</option>
                            {snapshotOptions.map((o) => (
                              <option key={o.key} value={o.key}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <Submit size="sm">Save</Submit>
                        </ActionForm>
                      </details>
                    </td>
                  )}
                </tr>
              ))}
              <tr className="font-semibold text-ink">
                <td className="py-2 pr-3">Total monthly equivalent</td>
                <td />
                <td />
                <td className="tabular py-2 pr-3 text-right">{fmtUsd(rec.totalMonthly, { cents: true })}</td>
                <td colSpan={canEdit ? 5 : 4} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Frequencies: {FREQUENCIES.map((f) => f.name).join(', ')}. Amount “?” = unknown; blank = no amount listed.</p>
      </Card>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card title="Domain renewals" note={`Rows in red renew within ${Number(app.domainAlertDays) || 60} days of the as-of date.`}>
          <table className="w-full text-[12.5px]">
            <thead className="text-left text-body">
              <tr className="border-b border-line">
                <th className="py-1.5 pr-2 font-semibold">Domain</th>
                <th className="py-1.5 pr-2 font-semibold">Price</th>
                <th className="py-1.5 pr-2 font-semibold">Renews</th>
                <th className="py-1.5 pr-2 text-right font-semibold">Days</th>
                <th className="py-1.5 font-semibold">Note</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.domain} className={`border-b border-line-soft ${d.alert ? 'bg-danger-soft text-danger' : d.cancelled ? 'text-muted' : ''}`}>
                  <td className="py-1.5 pr-2 font-medium">{d.domain}</td>
                  <td className="py-1.5 pr-2">{d.price || '–'}</td>
                  <td className="tabular py-1.5 pr-2">{d.renewal ?? '–'}</td>
                  <td className="tabular py-1.5 pr-2 text-right">{d.days ?? '–'}</td>
                  <td className="py-1.5">
                    {d.alert && <strong>{d.flag}. </strong>}
                    {d.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="In the October snapshot but missing from the current list" note="Review whether these were cancelled or just left off the list.">
          {rec.missingFromCurrent.length === 0 ? (
            <p className="text-sm text-muted">Nothing missing.</p>
          ) : (
            <ul className="divide-y divide-line-soft text-[13px]">
              {rec.missingFromCurrent.map((s) => (
                <li key={s.itemKey} className="flex justify-between gap-3 py-1.5">
                  <span>
                    {s.name}
                    {s.detail && <span className="text-muted"> · {s.detail}</span>}
                    {s.paymentMethod && <span className="block text-[11px] text-muted">{s.paymentMethod}</span>}
                  </span>
                  <span className="tabular whitespace-nowrap">{s.monthly === null ? '–' : `${fmtUsd(Number(s.monthly), { cents: true })}/mo`}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
