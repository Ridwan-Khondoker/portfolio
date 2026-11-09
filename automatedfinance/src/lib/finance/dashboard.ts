// Dashboard figures from derived rows. Mirrors the workbook's Financial Dashboard and the reference prototype.
import { Decimal, ZERO, cents } from '@/lib/money';
import { addMonths, indexYm, ymIndex } from '@/lib/months';
import { totalsRows } from './derive';
import type { DerivedExpense, RevenueFact, Settings } from './types';

export interface Filters {
  start: string; // YYYY-MM
  end: string; // YYYY-MM
  department: string; // 'All' or a department
  category: string; // 'All' or a category
  status: string; // 'All' or a payment status
}

export interface DashboardResult {
  months: string[];
  monthCount: number;
  current: string;
  previous: string;
  fyStart: string;
  total: number;
  currentMonth: number;
  previousMonth: number;
  mom: number | null;
  ytd: number;
  average: number;
  byType: Record<string, number>;
  recurringCommitments: number;
  subscriptionsMonthly: number;
  outstanding: number;
  outstandingCount: number;
  overdueCount: number;
  notRecordedCount: number;
  revenue: number;
  revenueProjected: number;
  expensesForProfit: number;
  netProfit: number;
  margin: number | null;
  largestCategory: { name: string; amount: number } | null;
  series: { month: string; expenses: number; revenue: number; revenueProjected: boolean; byDepartment: Record<string, number> }[];
  categories: { name: string; amount: number }[];
  vendors: { name: string; amount: number }[];
  budget: { department: string; budget: number; actual: number }[];
  hasEstimatesInRange: boolean;
}

export function fyStartFor(asOf: string, fyStartMonth: number): string {
  const [y, m] = asOf.split('-').map(Number) as [number, number];
  return `${m < fyStartMonth ? y - 1 : y}-${String(fyStartMonth).padStart(2, '0')}`;
}

export function computeDashboard(args: {
  rows: DerivedExpense[];
  revenue: RevenueFact[];
  subscriptionsMonthly: Decimal;
  budgets: { department: string; amount: Decimal }[];
  departments: string[];
  filters: Filters;
  settings: Settings;
}): DashboardResult {
  const { filters: f, settings } = args;
  const current = settings.asOf.slice(0, 7);
  const previous = addMonths(current, -1);
  const fyStart = fyStartFor(settings.asOf, settings.fyStartMonth);
  const [s, e] = ymIndex(f.start) <= ymIndex(f.end) ? [f.start, f.end] : [f.end, f.start];
  const months: string[] = [];
  for (let i = ymIndex(s); i <= ymIndex(e); i++) months.push(indexYm(i));
  const inMonths = (m: string | null, a: string, b: string) => !!m && m >= a && m <= b;

  const counted = totalsRows(args.rows);
  const okDept = (r: { department: string | null }) => f.department === 'All' || r.department === f.department;
  const okCat = (r: DerivedExpense) => f.category === 'All' || r.category === f.category;
  const okStat = (r: DerivedExpense) => f.status === 'All' || r.status === f.status;
  const filt = counted.filter((r) => okDept(r) && okCat(r) && okStat(r));
  const inRange = filt.filter((r) => inMonths(r.month, s, e));
  const sum = (arr: DerivedExpense[]) => arr.reduce((a, r) => a.plus(r.amountUsd!), ZERO);

  const total = sum(inRange);
  const curM = sum(filt.filter((r) => r.month === current));
  const prevM = sum(filt.filter((r) => r.month === previous));
  const ytd = sum(filt.filter((r) => inMonths(r.month, fyStart, current)));
  const byType: Record<string, Decimal> = { Fixed: ZERO, Variable: ZERO, 'Non-operating': ZERO, Unclassified: ZERO };
  for (const r of inRange) byType[r.expenseType] = (byType[r.expenseType] ?? ZERO).plus(r.amountUsd!);
  const recurring = sum(filt.filter((r) => r.month === current && r.recurring === 'Recurring' && r.expenseType !== 'Non-operating'));

  // Outstanding is a balance, not a period figure: all counted rows for the department.
  const deptRows = counted.filter(okDept);
  const outstandingRows = deptRows.filter((r) => r.status === 'Pending' || r.status === 'Overdue');
  const outstanding = sum(outstandingRows);
  const overdueCount = deptRows.filter((r) => r.status === 'Overdue').length;
  const notRecordedCount = deptRows.filter((r) => r.status === 'Not recorded').length;

  // Revenue and profit ignore the category and status filters.
  const revRange = args.revenue.filter((r) => okDept(r) && inMonths(r.month, s, e) && r.amount !== null);
  const revenue = revRange.reduce((a, r) => a.plus(r.amount!), ZERO);
  const revenueProjected = revRange.filter((r) => r.month > current).reduce((a, r) => a.plus(r.amount!), ZERO);
  const expForProfit = sum(deptRows.filter((r) => inMonths(r.month, s, e)));
  const profit = revenue.minus(expForProfit);

  const cats = new Map<string, Decimal>();
  for (const r of inRange) cats.set(r.category, (cats.get(r.category) ?? ZERO).plus(r.amountUsd!));
  const catList = [...cats.entries()].sort((a, b) => b[1].cmp(a[1]));
  const vend = new Map<string, Decimal>();
  for (const r of inRange) if (!r.recordType.startsWith('Summary')) vend.set(r.vendor ?? '(none)', (vend.get(r.vendor ?? '(none)') ?? ZERO).plus(r.amountUsd!));
  const vendList = [...vend.entries()].filter(([, v]) => v.gt(0)).sort((a, b) => b[1].cmp(a[1])).slice(0, 10);

  const series = months.map((m) => {
    const rows = filt.filter((r) => r.month === m);
    const byDepartment: Record<string, number> = {};
    for (const d of args.departments) byDepartment[d] = 0;
    for (const r of rows) byDepartment[r.department ?? 'Shared / Unassigned'] = (byDepartment[r.department ?? 'Shared / Unassigned'] ?? 0) + r.amountUsd!.toNumber();
    for (const k of Object.keys(byDepartment)) byDepartment[k] = Math.round(byDepartment[k]! * 100) / 100;
    const rev = args.revenue.filter((r) => r.month === m && okDept(r) && r.amount !== null).reduce((a, r) => a.plus(r.amount!), ZERO);
    return { month: m, expenses: cents(sum(rows)), revenue: cents(rev), revenueProjected: m > current, byDepartment };
  });

  const budget = args.departments
    .map((d) => ({
      department: d,
      budget: cents(args.budgets.find((b) => b.department === d)?.amount ?? ZERO),
      actual: cents(sum(counted.filter((r) => r.department === d && r.month === e))),
    }))
    .filter((b) => b.budget !== 0 || b.actual !== 0);

  return {
    months,
    monthCount: months.length,
    current,
    previous,
    fyStart,
    total: cents(total),
    currentMonth: cents(curM),
    previousMonth: cents(prevM),
    mom: prevM.isZero() ? null : curM.div(prevM).minus(1).toNumber(),
    ytd: cents(ytd),
    average: cents(total.div(Math.max(1, months.length))),
    byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, cents(v)])),
    recurringCommitments: cents(recurring),
    subscriptionsMonthly: cents(args.subscriptionsMonthly),
    outstanding: cents(outstanding),
    outstandingCount: outstandingRows.length,
    overdueCount,
    notRecordedCount,
    revenue: cents(revenue),
    revenueProjected: cents(revenueProjected),
    expensesForProfit: cents(expForProfit),
    netProfit: cents(profit),
    margin: revenue.isZero() ? null : profit.div(revenue).toNumber(),
    largestCategory: catList[0] ? { name: catList[0][0], amount: cents(catList[0][1]) } : null,
    series,
    categories: catList.map(([name, v]) => ({ name, amount: cents(v) })),
    vendors: vendList.map(([name, v]) => ({ name, amount: cents(v) })),
    budget,
    hasEstimatesInRange: inRange.some((r) => r.recordType.startsWith('Estimate')) || e > current,
  };
}

/** First month with counted expense data, for the default filter start. */
export function firstDataMonth(rows: DerivedExpense[]): string | null {
  let min: string | null = null;
  for (const r of totalsRows(rows)) if (r.month && (!min || r.month < min)) min = r.month;
  return min;
}
