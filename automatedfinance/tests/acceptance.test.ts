import { beforeAll, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { describeWithKit } from './kit-guard';
import { resetDb, setAsOf } from './db';
import { prisma } from '@/lib/db';
import { loadKit, type Kit } from '@/lib/seed/kit';
import { seedAll } from '@/lib/seed/seed';
import { analyzeIntoBatch, commitBatch, createPreview, rollbackBatch, saveMapping, type StoredPlan } from '@/lib/server/imports';
import { loadBudgets, loadChecks, loadPlanned, loadScenarios, loadSeasonality, loadSheetSnapshots, loadState, loadSubscriptionsMonthly } from '@/lib/server/state';
import { computeDashboard, type Filters } from '@/lib/finance/dashboard';
import { computeProjections } from '@/lib/finance/projections';
import { runChecks } from '@/lib/finance/reconciliation';
import { saveManualEntry, setPaymentStatus } from '@/lib/server/manual';

const ALL: Omit<Filters, 'start' | 'end'> = { department: 'All', category: 'All', status: 'All' };

async function dashboard(filters: Filters) {
  const state = await loadState();
  return computeDashboard({
    rows: state.rows,
    revenue: state.revenue,
    subscriptionsMonthly: await loadSubscriptionsMonthly(state.ref.departments),
    budgets: await loadBudgets(),
    departments: state.ref.departments,
    filters,
    settings: state.settings,
  });
}

function modifiedWorkbook(kit: Kit, edit: (wb: XLSX.WorkBook) => void): Buffer {
  const wb = XLSX.read(kit.workbook, { type: 'buffer', cellFormula: true, cellNF: true, cellStyles: false });
  edit(wb);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describeWithKit('acceptance tests 2-6 (database)', () => {
  let kit: Kit;
  let seedBatch: string;

  beforeAll(async () => {
    kit = loadKit();
    await resetDb();
    const report = await seedAll(prisma, kit);
    seedBatch = report.imported!.batchId;
    await setAsOf(kit.expected.as_of_date);
  });

  it('seed imported the workbook through the importer (608 rows, 480 counted)', async () => {
    const state = await loadState();
    expect(state.rows.length).toBe(608);
    expect(state.rows.filter((r) => r.counted).length).toBe(480);
  });

  it('2. reconciliation matches reconciliation_expected.csv', async () => {
    const state = await loadState();
    const results = runChecks({ checks: await loadChecks(), rows: state.rows, revenue: state.revenue, sheets: await loadSheetSnapshots() });
    const problems: string[] = [];
    for (const exp of kit.reconciliation) {
      const r = results.find((x) => x.name === exp.check);
      if (!r) {
        problems.push(`missing check ${exp.check}`);
        continue;
      }
      if (r.master.toFixed(2) !== Number(exp.master_total).toFixed(2)) problems.push(`${exp.check}: master ${r.master} != ${exp.master_total}`);
      if ((r.source ?? NaN).toFixed(2) !== Number(exp.source_total).toFixed(2)) problems.push(`${exp.check}: source ${r.source} != ${exp.source_total}`);
      if (r.status !== exp.status) problems.push(`${exp.check}: status ${r.status} != ${exp.status}`);
    }
    expect(problems).toEqual([]);
  });

  it('3. dashboard and projections match expected_results.json', async () => {
    const e = kit.expected.dashboard;
    const d = await dashboard({ start: '2025-09', end: '2026-11', ...ALL });
    expect(d.total).toBe(e.total_expenses);
    expect(d.currentMonth).toBe(e.current_month_nov_2026);
    expect(d.previousMonth).toBe(e.previous_month_oct_2026);
    expect(d.mom!).toBeCloseTo(e.mom_change, 6);
    expect(d.ytd).toBe(e.ytd_2026);
    expect(d.average).toBe(e.avg_monthly_15_months);
    expect(d.byType.Fixed).toBe(e.fixed);
    expect(d.byType.Variable).toBe(e.variable);
    expect(d.byType['Non-operating']).toBe(e.non_operating);
    expect(d.byType.Unclassified).toBe(e.unclassified_pl2025_summary);
    expect(d.recurringCommitments).toBe(e.recurring_commitments_nov);
    expect(d.subscriptionsMonthly).toBe(e.subscriptions_register_monthly);
    expect(d.revenue).toBe(e.revenue);
    expect(d.netProfit).toBe(e.net_profit);
    expect(d.margin!).toBeCloseTo(e.profit_margin, 6);
    expect(d.largestCategory?.name).toBe(e.largest_category);
    expect(d.notRecordedCount).toBe(480);

    const p = kit.expected.projections;
    const state = await loadState();
    const proj = computeProjections({ rows: state.rows, settings: state.settings, scenarios: await loadScenarios(), seasonality: await loadSeasonality(), planned: await loadPlanned() });
    expect(`${proj.windowStart}..${proj.windowEnd}`).toBe(p.baseline_window);
    expect(proj.baseFixed).toBe(p.avg_recurring_fixed);
    expect(proj.baseVariable).toBe(p.avg_recurring_variable);
    expect(proj.oneTimeExcluded).toBe(p.one_time_in_window_excluded);
    expect(proj.nonOperatingExcluded).toBe(p.non_operating_in_window_excluded);
    expect(proj.baseline).toBe(p.baseline_monthly);
    expect(proj.trend).toBeCloseTo(p.historical_trend_reference, 6);
    expect(proj.monthsOfHistory).toBe(14);
    expect(proj.seasonalityApplied).toBe(false);
    const byLabel = Object.fromEntries(proj.summary.map((s) => [s.label.replace(/\s*\(.*$/, ''), s.values]));
    for (const [label, vals] of Object.entries(p.summary as Record<string, Record<string, number>>)) {
      const mine = byLabel[label.replace(/\s*\(.*$/, '')]!;
      expect(mine, label).toBeDefined();
      expect(mine.conservative, `${label} conservative`).toBe(vals.conservative);
      expect(mine.base, `${label} base`).toBe(vals.base);
      expect(mine.high, `${label} high`).toBe(vals.high);
    }
    expect(proj.months[0]!.month).toBe('2026-12');
    expect(proj.months[0]!.scenarios.conservative!.total).toBe(p.month1_dec_2026.conservative);
    expect(proj.months[0]!.scenarios.base!.total).toBe(p.month1_dec_2026.base);
    expect(proj.months[0]!.scenarios.high!.total).toBe(p.month1_dec_2026.high);
  });

  it('4. re-importing the same file changes nothing; changing one cell changes exactly one row', async () => {
    const before = await dashboard({ start: '2025-09', end: '2026-11', ...ALL });
    const again = await createPreview({ buffer: kit.workbook, fileName: 'ORIGINAL_Google_Sheet_export.xlsx', origin: 'UPLOAD' });
    expect(again.summary.diff.counts).toMatchObject({ added: 0, changed: 0, removed: 0, factsAdded: 0, factsChanged: 0, factsRemoved: 0 });
    const r1 = await commitBatch(again.batchId, null);
    expect(r1).toEqual({ added: 0, changed: 0, removed: 0, factsChanged: 0 });
    expect((await dashboard({ start: '2025-09', end: '2026-11', ...ALL })).total).toBe(before.total);

    // Raise one counted cell (HTD!D24, February) by 5. Figures come from the kit, never hard-coded.
    const cell = kit.master.find((r) => r.source_cell === 'HTD!D24')!;
    const oldValue = Number(cell.amount_usd);
    const monthBefore = kit.master
      .filter((r) => r.counted_in_totals === '1' && r.department_project === 'HTD' && r.transaction_date === '2026-02-01')
      .reduce((a, r) => a + Number(r.amount_usd), 0);
    const edited = modifiedWorkbook(kit, (wb) => {
      wb.Sheets['HTD']!['D24'] = { t: 'n', v: oldValue + 5 };
    });
    const prev = await createPreview({ buffer: edited, fileName: 'edited.xlsx', origin: 'UPLOAD' });
    expect(prev.summary.diff.counts).toMatchObject({ added: 0, changed: 1, removed: 0 });
    const changedRow = prev.summary.diff.rows.find((r) => r.change === 'changed')!;
    expect(changedRow.cell).toBe('HTD!D24');
    expect([Number(changedRow.oldAmount), Number(changedRow.newAmount)]).toEqual([oldValue, oldValue + 5]);
    expect(prev.summary.diff.totals).toHaveLength(1);
    expect(prev.summary.diff.totals[0]).toMatchObject({ department: 'HTD', month: '2026-02', delta: 5 });
    expect(prev.summary.diff.totals[0]!.before).toBeCloseTo(monthBefore, 2);
    const r2 = await commitBatch(prev.batchId, null);
    expect(r2.added + r2.changed + r2.removed).toBe(1);
    const after = await dashboard({ start: '2025-09', end: '2026-11', ...ALL });
    expect(Math.round((after.total - before.total) * 100) / 100).toBe(5);

    // Rollback restores the previous value; the seed batch can't be rolled back while later batches changed its rows.
    await expect(rollbackBatch(seedBatch, null)).rejects.toThrow(/later batch/);
    await rollbackBatch(prev.batchId, null);
    expect((await dashboard({ start: '2025-09', end: '2026-11', ...ALL })).total).toBe(before.total);
  });

  it('5. a future-year tab (HTD 2027) imports after one mapping step, then with no prompts', async () => {
    const build = () =>
      modifiedWorkbook(kit, (wb) => {
        const copy = JSON.parse(JSON.stringify(wb.Sheets['HTD'])) as XLSX.WorkSheet;
        const out = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(out, copy, 'HTD 2027');
        wb.SheetNames = out.SheetNames;
        wb.Sheets = out.Sheets;
      });
    const first = await createPreview({ buffer: build(), fileName: 'HTD-2027.xlsx', origin: 'UPLOAD' });
    expect(first.summary.needsMapping).toBeGreaterThan(0);
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: first.batchId } });
    const plan = batch.plan as unknown as StoredPlan;
    // One mapping step: accept the pre-filled suggestions (copied from the HTD layout, year 2027).
    for (const m of plan.analysis.mappings) {
      expect(m.suggestionSource).toMatch(/^HTD /);
      if (!m.suggestion.skip) expect(m.suggestion.year).toBe(2027);
      await saveMapping({ tab: m.tab, signature: m.signature, config: m.suggestion, userId: null });
    }
    const re = await analyzeIntoBatch(first.batchId);
    expect(re.needsMapping).toBe(0);
    expect(re.diff.counts.added).toBe(150);
    await commitBatch(first.batchId, null);

    const second = await createPreview({ buffer: build(), fileName: 'HTD-2027.xlsx', origin: 'UPLOAD' });
    expect(second.summary.needsMapping).toBe(0);
    expect(second.summary.diff.counts).toMatchObject({ added: 0, changed: 0, removed: 0 });
    await commitBatch(second.batchId, null);

    // Jan 2027 shows the copied tab's January figures (same values as HTD January 2026 in the kit).
    const htdJan = kit.master
      .filter((r) => r.counted_in_totals === '1' && r.department_project === 'HTD' && r.transaction_date === '2026-01-01')
      .reduce((a, r) => a + Number(r.amount_usd), 0);
    const jan = await dashboard({ start: '2027-01', end: '2027-01', ...ALL });
    expect(jan.total).toBeGreaterThan(0);
    expect(jan.total).toBeCloseTo(htdJan, 2);
    expect(jan.series[0]!.byDepartment.HTD).toBeCloseTo(htdJan, 2);
  });

  it('6. manual entries: Pending with a past due date shows as Overdue and Outstanding; a duplicate is flagged', async () => {
    const input = {
      transactionDate: '2026-10-15',
      department: 'HTD',
      category: 'Software & Subscriptions',
      description: 'Test subscription renewal',
      vendor: 'Example Vendor',
      paymentMethod: 'Card',
      amount: '250.00',
      currency: 'USD',
      paymentStatus: 'Pending',
      dueDate: '2026-10-31',
      recurring: 'One-Time' as const,
      reference: '',
      notes: '',
    };
    const a = await saveManualEntry(input, 'test-user');
    let state = await loadState();
    const row = state.rows.find((r) => r.key === a.key)!;
    expect(row.counted).toBe(true);
    expect(row.storedStatus).toBe('Pending');
    expect(row.status).toBe('Overdue');
    const d = await dashboard({ start: '2025-09', end: '2026-11', ...ALL });
    expect(d.outstanding).toBe(250);
    expect(d.overdueCount).toBe(1);

    const b = await saveManualEntry(input, 'test-user');
    state = await loadState();
    const both = state.rows.filter((r) => r.key === a.key || r.key === b.key);
    expect(both).toHaveLength(2);
    for (const r of both) expect(r.flags).toContain('Possible duplicate');

    // Statuses survive a re-import of the source sheet.
    const grid = state.rows.find((r) => r.cell === 'HTD!C22')!;
    await setPaymentStatus(grid.key, 'Paid', null, 'test-user');
    const re = await createPreview({ buffer: kit.workbook, fileName: 'ORIGINAL_Google_Sheet_export.xlsx', origin: 'UPLOAD' });
    await commitBatch(re.batchId, null);
    state = await loadState();
    expect(state.rows.find((r) => r.key === grid.key)!.status).toBe('Paid');
  });
});
