import { requirePageUser } from '@/lib/server/auth';
import { hasRole } from '@/lib/security/roles';
import { loadPlanned, loadScenarios, loadSeasonality, loadState } from '@/lib/server/state';
import { prisma } from '@/lib/db';
import { computeProjections } from '@/lib/finance/projections';
import { fmtPct, fmtUsd } from '@/lib/money';
import { MONTH_SHORT, addMonths, monthLabel } from '@/lib/months';
import { SERIES } from '@/lib/palette';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Alert, inputClass } from '@/components/ui/Field';
import { ActionForm, Submit } from '@/components/ui/ActionForm';
import { ProjectionChart } from '@/components/charts/Charts';
import { addPlanned, deletePlanned, saveScenarios, saveSeasonality } from './actions';

export const metadata = { title: 'Projections' };

const COLORS: Record<string, string> = { conservative: SERIES[2], base: SERIES[1], high: SERIES[4] };
const pctStr = (v: { toString(): string }) => String(Math.round(Number(v.toString()) * 100 * 1000) / 1000);

export default async function ProjectionsPage() {
  const user = await requirePageUser();
  const canEdit = hasRole(user.role, 'EDITOR');
  const [state, scenarios, seasonality, planned, scenarioRows] = await Promise.all([loadState(), loadScenarios(), loadSeasonality(), loadPlanned(), prisma.scenario.findMany({ orderBy: { sortOrder: 'asc' } })]);
  const p = computeProjections({ rows: state.rows, settings: state.settings, scenarios, seasonality, planned });
  const keys = p.scenarios.map((s) => s.key);
  const current = state.settings.asOf.slice(0, 7);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Future projections</h1>
      <div className="mt-3">
        <Alert tone="warn">
          <strong>Planning estimates, not predictions.</strong> Built from the last {state.settings.baselineMonths} complete months of recurring spend and the assumptions below. Defaults are placeholders to review.
        </Alert>
      </div>

      <SectionTitle sub={`Window ${monthLabel(p.windowStart, true)} – ${monthLabel(p.windowEnd, true)} (last complete months before ${monthLabel(current, true)})`}>Baseline</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="Baseline per month" value={fmtUsd(p.baseline, { cents: true })} sub="Recurring fixed + variable" />
        <Stat label="Recurring fixed / month" value={fmtUsd(p.baseFixed, { cents: true })} />
        <Stat label="Recurring variable / month" value={fmtUsd(p.baseVariable, { cents: true })} />
        <Stat label="Reference trend (not applied)" value={fmtPct(p.trend, 2, true)} sub="Monthly, last 3 vs prior 3 months" />
        <Stat label="One-time spend excluded" value={fmtUsd(p.oneTimeExcluded, { cents: true })} sub="In the window" />
        <Stat label="Non-operating / unclassified excluded" value={fmtUsd(p.nonOperatingExcluded, { cents: true })} sub="In the window" />
        <Stat label="Months of history" value={String(p.monthsOfHistory)} sub="Months with spend, last 36" />
        <Stat label="Seasonality" value={p.seasonalityApplied ? 'Applied' : 'Off'} sub={p.seasonalityApplied ? 'Indexes below are applied to variable costs' : 'Needs 24+ months of history; indexes kept at 1.00'} />
      </div>

      <SectionTitle>Outputs</SectionTitle>
      <div className="grid gap-3">
        <Card title="Projected monthly operating expenses" note="Dashed grey line: the recent baseline average, for reference.">
          <ProjectionChart
            labels={p.months.map((m) => monthLabel(m.month))}
            series={p.scenarios.map((s) => ({ name: s.name, color: COLORS[s.key] ?? SERIES[0], values: p.months.map((m) => m.scenarios[s.key]!.total) }))}
            reference={{ name: 'Baseline average', values: p.months.map((m) => m.baselineRef) }}
          />
        </Card>
        <Card title="Totals by horizon">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-body">
                <th className="py-1.5 font-semibold">Horizon</th>
                {p.scenarios.map((s) => (
                  <th key={s.key} className="py-1.5 text-right font-semibold">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.summary.map((row) => (
                <tr key={row.label} className="border-b border-line-soft align-top">
                  <td className="py-1.5 pr-2">{row.label}</td>
                  {keys.map((k) => (
                    <td key={k} className="tabular py-1.5 pl-4 text-right whitespace-nowrap">
                      {fmtUsd(row.values[k] ?? 0, { cents: true })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      </div>

      <SectionTitle sub={canEdit ? 'Editors and admins can change these' : 'Read-only for viewers'}>Scenario assumptions</SectionTitle>
      <Card>
        <ActionForm action={saveScenarios}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-body">
                  <th className="py-2 font-semibold">Assumption</th>
                  {scenarioRows.map((s) => (
                    <th key={s.key} className="py-2 font-semibold">
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label="Monthly growth (variable costs), %">
                  {scenarioRows.map((s) =>
                    s.growthOverBase !== null ? (
                      <td key={s.key} className="py-1.5 pr-2">
                        <span className="flex items-center gap-1.5 text-muted">
                          Base +<Num name={`${s.key}.growthOverBase`} value={pctStr(s.growthOverBase)} disabled={!canEdit} />
                        </span>
                      </td>
                    ) : (
                      <td key={s.key} className="py-1.5 pr-2">
                        <Num name={`${s.key}.growth`} value={pctStr(s.growth)} disabled={!canEdit} />
                      </td>
                    ),
                  )}
                </Row>
                {(
                  [
                    ['inflation', 'Inflation (annual, all costs), %'],
                    ['fixAdjPct', 'Fixed adjustment, %'],
                    ['fixAdjAmt', 'Fixed adjustment, $ per month'],
                    ['varAdjPct', 'Variable adjustment, %'],
                    ['contingency', 'Contingency, %'],
                  ] as const
                ).map(([field, label]) => (
                  <Row key={field} label={label}>
                    {scenarioRows.map((s) => (
                      <td key={s.key} className="py-1.5 pr-2">
                        <Num name={`${s.key}.${field}`} value={field === 'fixAdjAmt' ? s.fixAdjAmt.toString() : pctStr(s[field])} disabled={!canEdit} />
                      </td>
                    ))}
                  </Row>
                ))}
                <Row label="Include planned expenses">
                  {scenarioRows.map((s) => (
                    <td key={s.key} className="py-1.5 pr-2">
                      <input type="checkbox" name={`${s.key}.includePlanned`} defaultChecked={s.includePlanned} disabled={!canEdit} aria-label={`${s.name}: include planned expenses`} />
                    </td>
                  ))}
                </Row>
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="mt-3">
              <Submit>Save assumptions</Submit>
            </div>
          )}
        </ActionForm>
        <p className="mt-3 text-xs text-muted">
          Fixed = (baseline fixed × (1 + adj %) + adj $) × (1 + inflation)^(m/12). Variable = baseline variable × (1 + adj %) × (1 + growth)^m × season × (1 + inflation)^(m/12). Total = (fixed + variable + planned) × (1 + contingency).
        </p>
      </Card>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card title="Seasonality index (variable costs)" note={p.seasonalityApplied ? undefined : `Not applied yet: ${p.monthsOfHistory} of 24 months of history.`}>
          <ActionForm action={saveSeasonality}>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {seasonality.map((v, i) => (
                <label key={i} className="text-xs font-semibold text-body">
                  {MONTH_SHORT[i]}
                  <input name={`m${i + 1}`} defaultValue={v.toString()} inputMode="decimal" disabled={!canEdit} className={`${inputClass} tabular mt-1 px-2 py-1.5`} />
                </label>
              ))}
            </div>
            {canEdit && (
              <div className="mt-3">
                <Submit variant="ghost" size="sm">
                  Save seasonality
                </Submit>
              </div>
            )}
          </ActionForm>
        </Card>
        <Card title="Planned expenses" note="One-off or new commitments not yet in history. Included only in the scenarios ticked.">
          {planned.length === 0 && <p className="text-sm text-muted">None yet.</p>}
          <ul className="divide-y divide-line-soft">
            {planned.map((pl) => (
              <li key={pl.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                <span>
                  <strong className="text-ink">{pl.description}</strong> · {monthLabel(pl.month, true)} · {pl.department} · {fmtUsd(pl.amount.toNumber(), { cents: true })}
                  <span className="text-muted"> · {[pl.inConservative && 'Conservative', pl.inBase && 'Base', pl.inHigh && 'High-cost'].filter(Boolean).join(', ') || 'no scenario'}</span>
                </span>
                {canEdit && (
                  <ActionForm action={deletePlanned}>
                    <input type="hidden" name="id" value={pl.id} />
                    <Submit variant="danger" size="sm" confirm="Remove this planned expense?">
                      Remove
                    </Submit>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <ActionForm action={addPlanned} resetOnSuccess className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 sm:grid-cols-4">
              <input name="description" placeholder="Description" aria-label="Description" className={`${inputClass} col-span-2`} required />
              <input name="month" type="month" aria-label="Month" defaultValue={addMonths(current, 2)} className={inputClass} required />
              <input name="amount" placeholder="Amount (USD)" aria-label="Amount" inputMode="decimal" className={inputClass} required />
              <select name="department" aria-label="Business" className={`${inputClass} col-span-2`} defaultValue={state.ref.departments[0]}>
                {state.ref.departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <div className="col-span-2 flex flex-wrap items-center gap-3 text-[13px]">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="inConservative" /> Conservative
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="inBase" defaultChecked /> Base
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="inHigh" defaultChecked /> High-cost
                </label>
              </div>
              <div className="col-span-2 sm:col-span-4">
                <Submit variant="ghost" size="sm">
                  Add planned expense
                </Submit>
              </div>
            </ActionForm>
          )}
        </Card>
      </div>

      <SectionTitle>24-month projection</SectionTitle>
      <Card>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead className="sticky top-0 bg-paper">
              <tr className="border-b border-line text-left text-body">
                <th className="py-1.5 pr-2 font-semibold">#</th>
                <th className="py-1.5 pr-2 font-semibold">Month</th>
                {p.scenarios.map((s) => (
                  <th key={s.key} className="py-1.5 pr-2 text-right font-semibold" colSpan={1}>
                    {s.name}
                  </th>
                ))}
                <th className="py-1.5 pr-2 text-right font-semibold">Fixed (Base)</th>
                <th className="py-1.5 pr-2 text-right font-semibold">Variable (Base)</th>
                <th className="py-1.5 pr-2 text-right font-semibold">Planned (Base)</th>
              </tr>
            </thead>
            <tbody>
              {p.months.map((m) => (
                <tr key={m.n} className="border-b border-line-soft">
                  <td className="py-1 pr-2 text-muted">{m.n}</td>
                  <td className="py-1 pr-2">{monthLabel(m.month, true)}</td>
                  {keys.map((k) => (
                    <td key={k} className="tabular py-1 pr-2 text-right">
                      {fmtUsd(m.scenarios[k]!.total, { cents: true })}
                    </td>
                  ))}
                  <td className="tabular py-1 pr-2 text-right text-muted">{fmtUsd(m.scenarios.base?.fixed ?? 0, { cents: true })}</td>
                  <td className="tabular py-1 pr-2 text-right text-muted">{fmtUsd(m.scenarios.base?.variable ?? 0, { cents: true })}</td>
                  <td className="tabular py-1 pr-2 text-right text-muted">{fmtUsd(m.scenarios.base?.planned ?? 0, { cents: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-paper px-3.5 py-3">
      <p className="text-xs font-semibold text-body">{label}</p>
      <p className="tabular mt-1 font-display text-[20px] font-semibold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-[11.5px] text-muted">{sub}</p>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-line-soft">
      <th scope="row" className="py-1.5 pr-3 text-left font-normal">
        {label}
      </th>
      {children}
    </tr>
  );
}

function Num({ name, value, disabled }: { name: string; value: string; disabled?: boolean }) {
  return <input name={name} defaultValue={value} inputMode="decimal" disabled={disabled} aria-label={name} className={`${inputClass} tabular w-28 px-2 py-1.5`} />;
}
