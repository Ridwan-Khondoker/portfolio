// One place that assembles everything a page needs: derived rows, revenue, recurring list, budgets, settings.
import { prisma } from '@/lib/db';
import { Decimal, ZERO } from '@/lib/money';
import { deriveExpenses } from '@/lib/finance/derive';
import { buildRecurring, domainRows, type DomainData, type RecurringFactData, type SnapshotItemData } from '@/lib/finance/recurring';
import type { CheckDef, SheetSnapshot } from '@/lib/finance/reconciliation';
import type { ScenarioInput, PlannedInput } from '@/lib/finance/projections';
import { financeSettings, loadAppSettings, loadCurrentExpenses, loadCurrentFacts, loadRefData, loadRevenue, loadStatuses } from './data';

export async function loadState(opts: { asOf?: string | null } = {}) {
  const [app, ref, facts, statuses, revenue] = await Promise.all([loadAppSettings(), loadRefData(), loadCurrentExpenses(), loadStatuses(), loadRevenue()]);
  const settings = financeSettings(app, opts.asOf);
  const rows = deriveExpenses(facts, statuses, ref, settings);
  return { app, ref, settings, rows, revenue, statuses };
}

export async function loadRecurring(departments: string[]) {
  const [items, snapshot, meta, domains] = await Promise.all([
    loadCurrentFacts('RECURRING'),
    loadCurrentFacts('SNAPSHOT_ITEM'),
    prisma.recurringItemMeta.findMany(),
    loadCurrentFacts('DOMAIN'),
  ]);
  const built = buildRecurring({
    items: items.map((i) => i.data as unknown as RecurringFactData),
    snapshot: snapshot.map((s) => s.data as unknown as SnapshotItemData),
    meta: meta.map((m) => ({ itemKey: m.itemKey, department: m.department, snapshotMatch: m.snapshotMatch, frequency: m.frequency })),
    departments,
  });
  return { ...built, domains: domains.map((d) => d.data as unknown as DomainData), snapshot: snapshot.map((s) => s.data as unknown as SnapshotItemData) };
}

export async function loadSubscriptionsMonthly(departments: string[]): Promise<Decimal> {
  const r = await loadRecurring(departments);
  return r.totalMonthlyDec ?? ZERO;
}

export async function loadBudgets() {
  const rows = await prisma.budget.findMany();
  return rows.map((b) => ({ department: b.department, amount: new Decimal(b.monthlyAmount.toString()) }));
}

export async function loadScenarios(): Promise<ScenarioInput[]> {
  const rows = await prisma.scenario.findMany({ orderBy: { sortOrder: 'asc' } });
  return rows.map((s) => ({
    key: s.key,
    name: s.name,
    growth: new Decimal(s.growth.toString()),
    growthOverBase: s.growthOverBase === null ? null : new Decimal(s.growthOverBase.toString()),
    inflation: new Decimal(s.inflation.toString()),
    fixAdjPct: new Decimal(s.fixAdjPct.toString()),
    fixAdjAmt: new Decimal(s.fixAdjAmt.toString()),
    varAdjPct: new Decimal(s.varAdjPct.toString()),
    includePlanned: s.includePlanned,
    contingency: new Decimal(s.contingency.toString()),
  }));
}

export async function loadSeasonality(): Promise<Decimal[]> {
  const rows = await prisma.seasonalityIndex.findMany({ orderBy: { month: 'asc' } });
  const out = Array.from({ length: 12 }, () => new Decimal(1));
  for (const r of rows) out[r.month - 1] = new Decimal(r.idx.toString());
  return out;
}

export async function loadPlanned(): Promise<PlannedInput[]> {
  const rows = await prisma.plannedExpense.findMany({ orderBy: { month: 'asc' } });
  return rows.map((p) => ({
    id: p.id,
    description: p.description,
    month: p.month.toISOString().slice(0, 7),
    department: p.department,
    amount: new Decimal(p.amount.toString()),
    inConservative: p.inConservative,
    inBase: p.inBase,
    inHigh: p.inHigh,
  }));
}

export async function loadChecks(): Promise<CheckDef[]> {
  const rows = await prisma.reconciliationCheck.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    periodLabel: c.periodLabel,
    periodStart: c.periodStart.toISOString().slice(0, 7),
    periodEnd: c.periodEnd.toISOString().slice(0, 7),
    measure: c.measure as CheckDef['measure'],
    department: c.department,
    sourceRefs: c.sourceRefs as unknown as CheckDef['sourceRefs'],
    sourceLabel: c.sourceLabel,
    explanation: c.explanation,
    explainedDifference: c.explainedDifference ? c.explainedDifference.toString() : null,
  }));
}

export async function loadSheetSnapshots(): Promise<Map<string, SheetSnapshot>> {
  const rows = await loadCurrentFacts('SHEET');
  const m = new Map<string, SheetSnapshot>();
  for (const r of rows) {
    const d = r.data as { sheet: string; year: number; cells: Record<string, string>; errors: Record<string, string> };
    m.set(`${d.sheet}|${d.year}`, { cells: d.cells, errors: d.errors });
  }
  return m;
}

export { domainRows };
