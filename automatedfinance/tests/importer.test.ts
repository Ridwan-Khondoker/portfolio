import { expect, it } from 'vitest';
import { describeWithKit } from './kit-guard';
import { loadKit, kitProfiles, kitRefData } from '@/lib/seed/kit';
import { analyzeBook } from '@/lib/importer/analyze';
import { deriveExpenses } from '@/lib/finance/derive';
import type { ExpenseFact } from '@/lib/finance/types';

function factsFrom(expenses: ReturnType<typeof analyzeBook>['expenses']): ExpenseFact[] {
  return expenses.map((e, i) => ({ ...e, id: String(i), batchId: 'b' }) as ExpenseFact);
}

describeWithKit('acceptance 1: importing the original export reproduces master_expenses.csv', () => {
  const kit = loadKit();
  const profiles = kitProfiles(kit);
  const ref = kitRefData(kit);
  const analysis = analyzeBook(kit.book, 'ORIGINAL_Google_Sheet_export.xlsx', { profiles, departments: ref.departments });
  const derived = deriveExpenses(factsFrom(analysis.expenses), new Map(), ref, {
    asOf: kit.expected.as_of_date,
    fyStartMonth: 1,
    recurringThreshold: 3,
    baselineMonths: 6,
    graceDays: 0,
  });

  it('needs no mapping and reports no errors', () => {
    expect(analysis.mappings.map((m) => `${m.tab}: ${m.title}`)).toEqual([]);
    expect(analysis.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('produces the same 608 source rows and the same 480 counted rows', () => {
    expect(derived.length).toBe(kit.master.length);
    const counted = derived.filter((r) => r.counted);
    const expected = kit.master.filter((r) => r.counted_in_totals === '1');
    expect(counted.length).toBe(expected.length);

    const mine = new Map(counted.map((r) => [r.cell!, r]));
    const problems: string[] = [];
    for (const e of expected) {
      const r = mine.get(e.source_cell!);
      if (!r) {
        problems.push(`missing ${e.source_cell}`);
        continue;
      }
      if (r.department !== e.department_project) problems.push(`${e.source_cell} dept ${r.department} != ${e.department_project}`);
      if (r.category !== e.expense_category) problems.push(`${e.source_cell} category ${r.category} != ${e.expense_category}`);
      if (r.amountUsd!.toFixed(2) !== Number(e.amount_usd).toFixed(2)) problems.push(`${e.source_cell} amount ${r.amountUsd!.toFixed(2)} != ${e.amount_usd}`);
      if (r.month + '-01' !== e.transaction_date) problems.push(`${e.source_cell} date ${r.month} != ${e.transaction_date}`);
      if (r.expenseType !== e.expense_type) problems.push(`${e.source_cell} type ${r.expenseType} != ${e.expense_type}`);
      if (r.recurring !== e.recurring_one_time) problems.push(`${e.source_cell} recurring ${r.recurring} != ${e.recurring_one_time}`);
      if (r.vendor !== e.vendor_payee) problems.push(`${e.source_cell} vendor ${r.vendor} != ${e.vendor_payee}`);
      if (r.description !== e.expense_description) problems.push(`${e.source_cell} description ${r.description} != ${e.expense_description}`);
      if (r.recordType !== e.record_type) problems.push(`${e.source_cell} record type ${r.recordType} != ${e.record_type}`);
      if (r.displayId !== e.transaction_id_reference) problems.push(`${e.source_cell} id ${r.displayId} != ${e.transaction_id_reference}`);
    }
    expect(problems).toEqual([]);
  });

  it('flags the same rows as the workbook', () => {
    const flagged = derived.filter((r) => r.counted && r.flags.length).map((r) => `${r.cell}: ${r.flags.join('; ')}`);
    const expected = kit.master.filter((r) => r.counted_in_totals === '1' && r.data_check && r.data_check !== 'OK').map((r) => r.source_cell);
    expect(flagged.map((f) => f.split(':')[0] + ':' + f.split(':')[1]).map((s) => s.replace(/:.*/, '')).sort()).toEqual(
      expected.map((c) => c!.replace(/:.*/, '')).sort(),
    );
  });
});
