// Read-time derivation of every rule that depends on settings, so changes apply retroactively.
// Mirrors the processed workbook's Master Expenses formulas (category, type, counted, recurring, status, checks).
import { Decimal, ZERO } from '@/lib/money';
import { addDays } from '@/lib/months';
import { OTHER_CATEGORY, type DerivedExpense, type ExpenseFact, type ExpenseType, type PayStatus, type RefData, type Settings, type StoredStatus } from './types';

export function normLabel(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function makeLookups(ref: RefData) {
  const catByNorm = new Map(ref.categories.map((c) => [normLabel(c.name), c]));
  const mapByNorm = new Map(ref.mappings.map((m) => [normLabel(m.sourceLabel), m.category]));
  const fx = new Map(ref.fx.map((f) => [f.code.toUpperCase(), f.unitsPerUsd]));
  const depts = new Map(ref.departments.map((d) => [normLabel(d), d]));
  return { catByNorm, mapByNorm, fx, depts };
}

type Lookups = ReturnType<typeof makeLookups>;

/** Category resolution: per-row/block override > source label mapping > standard category typed directly > Other (flagged). */
export function resolveCategory(f: Pick<ExpenseFact, 'categoryOverride' | 'sourceCategory'>, lk: Lookups): { category: string; problem: string | null } {
  if (f.categoryOverride) {
    const c = lk.catByNorm.get(normLabel(f.categoryOverride));
    return c ? { category: c.name, problem: null } : { category: f.categoryOverride, problem: `Category “${f.categoryOverride}” is not in the category list` };
  }
  const label = normLabel(f.sourceCategory);
  if (!label) return { category: OTHER_CATEGORY, problem: 'Missing category' };
  const mapped = lk.mapByNorm.get(label);
  if (mapped) {
    const c = lk.catByNorm.get(normLabel(mapped));
    return c ? { category: c.name, problem: null } : { category: mapped, problem: `Category “${mapped}” is not in the category list` };
  }
  const direct = lk.catByNorm.get(label);
  if (direct) return { category: direct.name, problem: null };
  return { category: OTHER_CATEGORY, problem: `Category not in list (“${f.sourceCategory}”); mapped to ${OTHER_CATEGORY}` };
}

export function deriveExpenses(facts: ExpenseFact[], statuses: Map<string, StoredStatus>, ref: RefData, settings: Settings): DerivedExpense[] {
  const lk = makeLookups(ref);

  // 1. Amount in USD and category/type.
  const rows: DerivedExpense[] = facts.map((f) => {
    const flags: string[] = [];
    let amountUsd: Decimal | null = null;
    if (f.amount !== null && f.amount !== undefined) {
      const amt = new Decimal(f.amount);
      const cur = (f.currency || 'USD').toUpperCase();
      if (cur === 'USD') amountUsd = amt;
      else if (!lk.fx.has(cur)) flags.push(`Unknown currency ${cur}`);
      else {
        const rate = lk.fx.get(cur);
        if (!rate || new Decimal(rate).lte(0)) flags.push(`Missing FX rate for ${cur}`);
        else amountUsd = amt.div(rate);
      }
    }
    const { category, problem } = resolveCategory(f, lk);
    if (problem) flags.push(problem);
    const type = (lk.catByNorm.get(normLabel(category))?.expenseType as ExpenseType | undefined) ?? 'Unclassified';
    const st = statuses.get(f.key);
    const storedStatus = (['Paid', 'Pending', 'Overdue', 'Not recorded'].includes(st?.status ?? '') ? st!.status : 'Not recorded') as PayStatus;
    const dueDate = st?.dueDate ?? null;
    let status: PayStatus = storedStatus;
    if (storedStatus === 'Pending' && dueDate && addDays(dueDate, settings.graceDays) < settings.asOf) status = 'Overdue';
    return { ...f, amountUsd, category, expenseType: type, counted: false, recurring: '', storedStatus, status, dueDate, flags };
  });

  // 2. Counted in totals. Estimate/actual pairs: count ACTUAL for a month when its trigger lines (payroll) sum > 0, else ESTIMATE.
  const triggerSums = new Map<string, Decimal>();
  for (const r of rows) {
    if (r.countRole === 'ACTUAL' && r.isTrigger && r.countGroup && r.month && r.amountUsd) {
      const k = `${r.countGroup}|${r.month}`;
      triggerSums.set(k, (triggerSums.get(k) ?? ZERO).plus(r.amountUsd));
    }
  }
  for (const r of rows) {
    if (r.countRole === 'ALWAYS' || !r.countGroup || !r.month) r.counted = r.countRole === 'ALWAYS' || !r.countGroup;
    else {
      const actual = (triggerSums.get(`${r.countGroup}|${r.month}`) ?? ZERO).gt(0);
      r.counted = r.countRole === 'ACTUAL' ? actual : !actual;
    }
  }

  // 3. Recurring vs one-time: a source line with spend (> 0) in at least N counted months. Manual/uploaded rows use their own field.
  const lineMonths = new Map<string, number>();
  for (const r of rows) {
    if (r.counted && r.lineKey && r.amountUsd && r.amountUsd.gt(0)) lineMonths.set(r.lineKey, (lineMonths.get(r.lineKey) ?? 0) + 1);
  }
  for (const r of rows) {
    if (!r.amountUsd || r.amountUsd.isZero()) r.recurring = '';
    else if (r.recurringOverride === 'Recurring' || r.recurringOverride === 'One-Time') r.recurring = r.recurringOverride;
    else if (r.lineKey) r.recurring = (lineMonths.get(r.lineKey) ?? 0) >= settings.recurringThreshold ? 'Recurring' : 'One-Time';
    else r.recurring = 'One-Time';
  }

  // 4. Data checks (counted rows, plus every manual/uploaded entry since those are typed by people).
  const dupCounts = new Map<string, number>();
  const dupKey = (r: DerivedExpense) => `${normLabel(r.department)}|${r.month}|${normLabel(r.description)}|${r.amountUsd?.toFixed(6)}`;
  for (const r of rows) if (r.counted && r.amountUsd && !r.amountUsd.isZero()) dupCounts.set(dupKey(r), (dupCounts.get(dupKey(r)) ?? 0) + 1);
  for (const r of rows) {
    const checkable = r.counted || r.kind === 'MANUAL' || r.kind === 'TRANSACTION';
    if (!checkable) {
      r.flags = [];
      continue;
    }
    if (r.rawValue !== null && r.rawValue !== undefined && r.amount === null) {
      r.flags.unshift(/^#/.test(r.rawValue) ? `Error value in source (${r.rawValue})` : `Non-numeric amount (“${r.rawValue || 'blank'}”)`);
    }
    if (!r.month || !r.txnDate) r.flags.push('Missing or invalid date');
    if (!r.department) r.flags.push('Missing department');
    else if (!lk.depts.has(normLabel(r.department))) r.flags.push(`Unknown department “${r.department}”`);
    if (r.amountUsd && r.amountUsd.lt(0)) r.flags.push('Negative amount');
    if ((r.description ?? '').includes('???')) r.flags.push('Unclear description (“???”)');
    if (r.counted && r.amountUsd && !r.amountUsd.isZero() && (dupCounts.get(dupKey(r)) ?? 0) > 1) r.flags.push('Possible duplicate');
  }
  return rows;
}

/** Rows that add to totals: counted, dated, with a USD amount. */
export function totalsRows(rows: DerivedExpense[]): DerivedExpense[] {
  return rows.filter((r) => r.counted && r.month && r.amountUsd && !r.amountUsd.isZero());
}

export function flagKey(r: Pick<DerivedExpense, 'key'>, flag: string): string {
  return `${r.key}::${flag.replace(/\s*\(.*$/, '')}`;
}
