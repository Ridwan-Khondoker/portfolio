import Link from 'next/link';
import { requirePageUser } from '@/lib/server/auth';
import { loadBudgets, loadState, loadSubscriptionsMonthly } from '@/lib/server/state';
import { parseFilters, filterQuery, type SearchParams } from '@/lib/server/filters';
import { computeDashboard, firstDataMonth } from '@/lib/finance/dashboard';
import { totalsRows } from '@/lib/finance/derive';
import { fmtPct, fmtUsd } from '@/lib/money';
import { monthLabel } from '@/lib/months';
import { categoryColorMap, departmentColor, FOLD, SERIES } from '@/lib/palette';
import { FilterBar } from '@/components/FilterBar';
import { Kpi } from '@/components/Kpi';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Field';
import { CategoryDonut, ClusteredChart, HBarChart, StackedChart, TrendChart } from '@/components/charts/Charts';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePageUser();
  const params = await searchParams;
  const state = await loadState();
  const { ref, settings, rows } = state;
  const current = settings.asOf.slice(0, 7);
  const firstMonth = firstDataMonth(rows);
  const categories = ref.categories.map((c) => c.name);
  const filters = parseFilters(params, { current, firstMonth, departments: ref.departments, categories });
  const [subs, budgets] = await Promise.all([loadSubscriptionsMonthly(ref.departments), loadBudgets()]);
  const d = computeDashboard({ rows, revenue: state.revenue, subscriptionsMonthly: subs, budgets, departments: ref.departments, filters, settings });

  if (!rows.length) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Alert tone="info">No data yet. An Editor can import the expense workbook on the Upload &amp; sync page.</Alert>
      </div>
    );
  }

  // Colour follows the category: the seven largest categories over all data keep fixed slots.
  const allCats = new Map<string, number>();
  for (const r of totalsRows(rows)) allCats.set(r.category, (allCats.get(r.category) ?? 0) + r.amountUsd!.toNumber());
  const catColors = categoryColorMap([...allCats.entries()].map(([name, amount]) => ({ name, amount })));
  const slotOrder = [...catColors.keys()];
  const slices = slotOrder
    .map((name) => ({ name, amount: d.categories.find((c) => c.name === name)?.amount ?? 0, color: catColors.get(name)! }))
    .filter((s) => s.amount > 0);
  const other = d.categories.filter((c) => !catColors.has(c.name)).reduce((a, c) => a + c.amount, 0);
  if (other > 0) slices.push({ name: 'All other', amount: Math.round(other * 100) / 100, color: FOLD });

  const labels = d.series.map((s) => monthLabel(s.month));
  const firstProjected = d.series.findIndex((s) => s.revenueProjected);
  const pctOf = (v: number) => (d.total ? `${Math.round((v / d.total) * 100)}% of total` : '');
  const q = filterQuery(filters);
  const deptSeries = ref.departments
    .map((dep) => ({ name: dep, color: departmentColor(dep, ref.departments), values: d.series.map((s) => s.byDepartment[dep] ?? 0) }))
    .filter((s) => s.values.some((v) => v !== 0));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {params.denied && <Alert tone="warn">Your role does not have access to that page.</Alert>}
      </div>
      <FilterBar
        {...filters}
        departments={ref.departments}
        categories={categories}
        defaults={{ start: firstMonth ?? filters.start, end: current }}
        note={`${monthLabel(d.months[0]!)} – ${monthLabel(d.months[d.months.length - 1]!)} (${d.monthCount} months)${
          filters.end > current ? ' · the range runs past the as-of month, so estimate and projected figures are included' : ''
        }`}
      />

      <SectionTitle sub="Counted rows only (no double counting of estimate vs actual blocks)">Expenses</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Total expenses" value={fmtUsd(d.total)} sub="Selected range" href={`/transactions${q}`} />
        <Kpi label="Current month" value={fmtUsd(d.currentMonth)} sub={`${monthLabel(d.current, true)} (in progress)`} />
        <Kpi label="Previous month" value={fmtUsd(d.previousMonth)} sub={monthLabel(d.previous, true)} />
        <Kpi
          label="Month over month"
          value={d.mom === null ? 'n/a' : `${d.mom > 0 ? '▲' : d.mom < 0 ? '▼' : ''} ${fmtPct(Math.abs(d.mom))}`}
          sub={d.mom === null ? 'No spend last month' : `${d.mom > 0 ? 'Up' : 'Down'} vs ${monthLabel(d.previous)}`}
        />
        <Kpi label="Year to date" value={fmtUsd(d.ytd)} sub={`Fiscal year from ${monthLabel(d.fyStart, true)}`} />
        <Kpi label="Average per month" value={fmtUsd(d.average)} sub={`Range total ÷ ${d.monthCount}`} />
        <Kpi label="Fixed" value={fmtUsd(d.byType.Fixed)} sub={pctOf(d.byType.Fixed ?? 0)} />
        <Kpi label="Variable" value={fmtUsd(d.byType.Variable)} sub={pctOf(d.byType.Variable ?? 0)} />
        <Kpi label="Recurring commitments" value={fmtUsd(d.recurringCommitments)} sub={`${monthLabel(d.current)}, recurring lines, excl. non-operating`} />
        <Kpi label="Subscriptions & services" value={fmtUsd(d.subscriptionsMonthly)} sub="Monthly equivalent of the current list" href="/recurring" />
        <Kpi
          label="Outstanding"
          value={fmtUsd(d.outstanding)}
          sub={`${d.outstandingCount} pending/overdue (${d.overdueCount} overdue) · status not recorded on ${d.notRecordedCount.toLocaleString()} rows`}
          tone={d.overdueCount ? 'bad' : undefined}
          href={`/transactions?status=Overdue`}
        />
        <Kpi label="Non-operating" value={fmtUsd(d.byType['Non-operating'])} sub={`Partner distributions${d.byType.Unclassified ? ` · ${fmtUsd(d.byType.Unclassified)} unitemized P&L totals` : ''}`} />
      </div>

      <SectionTitle sub="Revenue from the P&L tabs; the category and status filters don't apply">Profitability</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Revenue" value={fmtUsd(d.revenue)} sub={d.revenueProjected ? `Includes ${fmtUsd(d.revenueProjected)} projected (after ${monthLabel(d.current)})` : 'P&L revenue, selected range'} />
        <Kpi label="Expenses" value={fmtUsd(d.expensesForProfit)} sub="Business filter only" />
        <Kpi label="Net profit / (loss)" value={fmtUsd(d.netProfit)} sub="Revenue − expenses" tone={d.netProfit >= 0 ? 'good' : 'bad'} />
        <Kpi label="Profit margin" value={d.margin === null ? 'n/a' : fmtPct(d.margin)} sub="Net profit ÷ revenue" />
        <Kpi label="Operating cash flow" value="Not available" sub="No cash-timing data in the source sheets" tone="muted" />
        <Kpi label="Largest category" value={d.largestCategory?.name ?? '–'} sub={d.largestCategory ? fmtUsd(d.largestCategory.amount) : ''} tone="text" />
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <Card title="Monthly expenses vs revenue" className="lg:col-span-2" note={firstProjected >= 0 ? 'Dashed revenue = projected months (after the as-of month).' : undefined}>
          <TrendChart months={d.series.map((s) => s.month)} labels={labels} expenses={d.series.map((s) => s.expenses)} revenue={d.series.map((s) => s.revenue)} firstProjected={firstProjected < 0 ? 9999 : firstProjected} />
        </Card>
        <Card title="Expense breakdown by category" note="The seven largest categories overall keep fixed colours; the rest are grouped as All other.">
          {slices.length ? <CategoryDonut slices={slices} /> : <p className="text-sm text-muted">No expenses in this range.</p>}
        </Card>
        <Card title="Fixed vs variable">
          <HBarChart
            label="Expenses by type"
            labels={['Fixed', 'Variable', 'Non-operating', 'Unclassified']}
            values={[d.byType.Fixed ?? 0, d.byType.Variable ?? 0, d.byType['Non-operating'] ?? 0, d.byType.Unclassified ?? 0]}
            height={200}
          />
        </Card>
        <Card title="Monthly expenses by business" className="lg:col-span-2">
          <StackedChart label="Monthly expenses stacked by business" labels={labels} series={deptSeries} />
        </Card>
        <Card title="Top 10 vendors / payees" className="lg:col-span-2" note="Excludes P&L summary totals (they have no vendor detail).">
          {d.vendors.length ? <HBarChart label="Top 10 vendors by spend" labels={d.vendors.map((v) => v.name)} values={d.vendors.map((v) => v.amount)} /> : <p className="text-sm text-muted">No vendor spend in this range.</p>}
        </Card>
        <Card title={`Actual vs budget · ${monthLabel(filters.end, true)}`} note="Budget = monthly run-rate per business (editable in Settings).">
          <ClusteredChart
            label={`Actual vs budget for ${monthLabel(filters.end, true)}`}
            labels={d.budget.map((b) => (b.department.length > 8 ? b.department.split(' ') : b.department))}
            series={[
              { name: 'Actual', color: SERIES[0], values: d.budget.map((b) => b.actual) },
              { name: 'Budget', color: SERIES[1], values: d.budget.map((b) => b.budget) },
            ]}
          />
        </Card>
      </div>

      <details className="mt-4 rounded-2xl border border-line bg-paper p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Monthly figures as a table</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-body">
                <th className="py-1.5 pr-3 font-semibold">Month</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Expenses</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Revenue</th>
                {deptSeries.map((s) => (
                  <th key={s.name} className="py-1.5 pr-3 text-right font-semibold">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.series.map((s) => (
                <tr key={s.month} className="border-b border-line-soft">
                  <td className="py-1 pr-3">{monthLabel(s.month, true)}</td>
                  <td className="tabular py-1 pr-3 text-right">{fmtUsd(s.expenses, { cents: true })}</td>
                  <td className="tabular py-1 pr-3 text-right">
                    {fmtUsd(s.revenue, { cents: true })}
                    {s.revenueProjected ? ' *' : ''}
                  </td>
                  {deptSeries.map((dep) => (
                    <td key={dep.name} className="tabular py-1 pr-3 text-right">
                      {fmtUsd(s.byDepartment[dep.name] ?? 0, { cents: true })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {firstProjected >= 0 && <p className="mt-2 text-xs text-muted">* projected revenue</p>}
        </div>
      </details>
    </div>
  );
}
