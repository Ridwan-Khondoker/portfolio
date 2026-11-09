// Scenario forecast, matching the processed workbook's "Future Projections" tab exactly.
// Planning estimates, not predictions.
import { Decimal, ZERO, cents } from '@/lib/money';
import { addMonths, ymIndex } from '@/lib/months';
import { totalsRows } from './derive';
import { fyStartFor } from './dashboard';
import type { DerivedExpense, Settings } from './types';

export interface ScenarioInput {
  key: string;
  name: string;
  growth: Decimal;
  growthOverBase: Decimal | null; // High-cost: Base growth + this
  inflation: Decimal;
  fixAdjPct: Decimal;
  fixAdjAmt: Decimal;
  varAdjPct: Decimal;
  includePlanned: boolean;
  contingency: Decimal;
}

export interface PlannedInput {
  id: string;
  description: string;
  month: string; // YYYY-MM
  department: string;
  amount: Decimal;
  inConservative: boolean;
  inBase: boolean;
  inHigh: boolean;
}

export interface ProjectionMonth {
  n: number;
  month: string;
  season: number;
  baselineRef: number;
  scenarios: Record<string, { fixed: number; variable: number; planned: number; total: number }>;
}

export interface ProjectionResult {
  windowStart: string;
  windowEnd: string;
  baseFixed: number;
  baseVariable: number;
  baseline: number;
  oneTimeExcluded: number;
  nonOperatingExcluded: number;
  trend: number;
  monthsOfHistory: number;
  seasonalityApplied: boolean;
  months: ProjectionMonth[];
  summary: { label: string; values: Record<string, number> }[];
  scenarios: { key: string; name: string; growth: number }[];
}

function plannedIn(p: PlannedInput, key: string): boolean {
  return key === 'conservative' ? p.inConservative : key === 'high' ? p.inHigh : p.inBase;
}

export function computeProjections(args: {
  rows: DerivedExpense[];
  settings: Settings;
  scenarios: ScenarioInput[];
  seasonality: Decimal[]; // 12 indexes, Jan..Dec
  planned: PlannedInput[];
}): ProjectionResult {
  const { settings } = args;
  const N = settings.baselineMonths;
  const current = settings.asOf.slice(0, 7);
  const lastFull = addMonths(current, -1);
  const wStart = addMonths(lastFull, -(N - 1));
  const counted = totalsRows(args.rows);
  const between = (m: string | null, a: string, b: string) => !!m && m >= a && m <= b;
  const sumWhere = (pred: (r: DerivedExpense) => boolean) => counted.filter(pred).reduce((a, r) => a.plus(r.amountUsd!), ZERO);

  const inWin = (r: DerivedExpense) => between(r.month, wStart, lastFull);
  const baseFixed = sumWhere((r) => inWin(r) && r.expenseType === 'Fixed' && r.recurring === 'Recurring').div(N);
  const baseVar = sumWhere((r) => inWin(r) && r.expenseType === 'Variable' && r.recurring === 'Recurring').div(N);
  const oneTime = sumWhere((r) => inWin(r) && r.recurring === 'One-Time');
  const nonOp = sumWhere((r) => inWin(r) && (r.expenseType === 'Non-operating' || r.expenseType === 'Unclassified'));

  const recFV = (a: string, b: string) => sumWhere((r) => between(r.month, a, b) && r.recurring === 'Recurring' && (r.expenseType === 'Fixed' || r.expenseType === 'Variable'));
  const last3 = recFV(addMonths(lastFull, -2), lastFull);
  const prior3 = recFV(addMonths(lastFull, -5), addMonths(lastFull, -3));
  let trend = 0;
  if (!prior3.isZero() && last3.div(prior3).gt(0)) trend = last3.div(prior3).pow(new Decimal(1).div(3)).minus(1).toNumber();

  let monthsOfHistory = 0;
  for (let i = 0; i < 36; i++) {
    const m = addMonths(lastFull, -i);
    if (sumWhere((r) => r.month === m).gt(0)) monthsOfHistory++;
  }
  const seasonalityApplied = monthsOfHistory >= 24;

  const base = args.scenarios.find((s) => s.key === 'base');
  const scen = args.scenarios.map((s) => ({ ...s, g: s.growthOverBase !== null && base ? base.growth.plus(s.growthOverBase) : s.growth }));
  const one = new Decimal(1);
  const months: ProjectionMonth[] = [];
  const totals: Record<string, Decimal[]> = {};
  for (let n = 1; n <= 24; n++) {
    const month = addMonths(current, n);
    const cal = Number(month.slice(5, 7));
    const season = seasonalityApplied ? (args.seasonality[cal - 1] ?? one) : one;
    const entry: ProjectionMonth = { n, month, season: season.toNumber(), baselineRef: cents(baseFixed.plus(baseVar)), scenarios: {} };
    for (const s of scen) {
      const infl = one.plus(s.inflation).pow(new Decimal(n).div(12));
      const fixed = baseFixed.times(one.plus(s.fixAdjPct)).plus(s.fixAdjAmt).times(infl);
      const variable = baseVar.times(one.plus(s.varAdjPct)).times(one.plus(s.g).pow(n)).times(season).times(infl);
      const planned = s.includePlanned ? args.planned.filter((p) => p.month === month && plannedIn(p, s.key)).reduce((a, p) => a.plus(p.amount), ZERO) : ZERO;
      const total = fixed.plus(variable).plus(planned).times(one.plus(s.contingency));
      (totals[s.key] ??= []).push(total);
      entry.scenarios[s.key] = { fixed: cents(fixed), variable: cents(variable), planned: cents(planned), total: cents(total) };
    }
    months.push(entry);
  }
  const sumFirst = (key: string, k: number) => cents((totals[key] ?? []).slice(0, k).reduce((a, v) => a.plus(v), ZERO));
  const nextFy = addMonths(fyStartFor(settings.asOf, settings.fyStartMonth), 12);
  const nextFyEnd = addMonths(nextFy, 11);
  const fyLabel = `Full next fiscal year (${monthName(nextFy)} – ${monthName(nextFyEnd)})`;
  const summary = [
    { label: 'Next 3 months', values: Object.fromEntries(scen.map((s) => [s.key, sumFirst(s.key, 3)])) },
    { label: 'Next 6 months', values: Object.fromEntries(scen.map((s) => [s.key, sumFirst(s.key, 6)])) },
    { label: 'Next 12 months', values: Object.fromEntries(scen.map((s) => [s.key, sumFirst(s.key, 12)])) },
    {
      label: fyLabel,
      values: Object.fromEntries(
        scen.map((s) => [
          s.key,
          cents(months.reduce((a, m, i) => (ymIndex(m.month) >= ymIndex(nextFy) && ymIndex(m.month) <= ymIndex(nextFyEnd) ? a.plus(totals[s.key]![i]!) : a), ZERO)),
        ]),
      ),
    },
  ];
  return {
    windowStart: wStart,
    windowEnd: lastFull,
    baseFixed: cents(baseFixed),
    baseVariable: cents(baseVar),
    baseline: cents(baseFixed.plus(baseVar)),
    oneTimeExcluded: cents(oneTime),
    nonOperatingExcluded: cents(nonOp),
    trend,
    monthsOfHistory,
    seasonalityApplied,
    months,
    summary,
    scenarios: scen.map((s) => ({ key: s.key, name: s.name, growth: s.g.toNumber() })),
  };
}

function monthName(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
}

export const DEFAULT_SCENARIOS = [
  { key: 'conservative', name: 'Conservative', sortOrder: 1, growth: '0', growthOverBase: null, inflation: '0.02', fixAdjPct: '0', fixAdjAmt: '0', varAdjPct: '-0.1', includePlanned: true, contingency: '0' },
  { key: 'base', name: 'Base', sortOrder: 2, growth: '0', growthOverBase: null, inflation: '0.03', fixAdjPct: '0', fixAdjAmt: '0', varAdjPct: '0', includePlanned: true, contingency: '0.05' },
  { key: 'high', name: 'High-cost', sortOrder: 3, growth: '0', growthOverBase: '0.01', inflation: '0.05', fixAdjPct: '0.05', fixAdjAmt: '0', varAdjPct: '0.1', includePlanned: true, contingency: '0.1' },
];
