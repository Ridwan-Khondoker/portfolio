// Compares a plan with the current state: rows added, amounts changed (old -> new), rows removed, and the effect on
// counted totals per business-month. Pure.
import { Decimal, ZERO, cents } from '@/lib/money';
import { deriveExpenses, totalsRows } from '@/lib/finance/derive';
import type { ExpenseFact, RefData, Settings } from '@/lib/finance/types';
import type { PlanExpense, PlanFact, Scope } from './types';

export const COMPARED_FIELDS: (keyof PlanExpense)[] = [
  'kind',
  'lineKey',
  'month',
  'txnDate',
  'department',
  'sourceCategory',
  'categoryOverride',
  'item',
  'description',
  'vendor',
  'amount',
  'currency',
  'rawValue',
  'recordType',
  'countRole',
  'countGroup',
  'isTrigger',
  'recurringOverride',
  'paymentMethod',
  'reference',
  'notes',
  'cell',
  'displayId',
];

function same(a: unknown, b: unknown): boolean {
  if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) return true;
  if (typeof a === 'string' && typeof b === 'string' && /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(a) && /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(b)) return new Decimal(a).eq(b);
  return a === b;
}

export function expenseChanged(plan: PlanExpense, current: Partial<PlanExpense>): (keyof PlanExpense)[] {
  return COMPARED_FIELDS.filter((f) => !same(plan[f], current[f]));
}

/** JSON with object keys sorted at every level (Postgres jsonb does not keep key order). */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export function factChanged(plan: PlanFact, currentData: unknown): boolean {
  return canonicalJson(plan.data) !== canonicalJson(currentData);
}

export function inScope(key: string, scopes: Scope[], kind: Scope['kind']): boolean {
  return scopes.some((s) => s.kind === kind && (s.prefix.startsWith('SHEET:') ? key === s.prefix : key.startsWith(s.prefix)));
}

export interface ChangeRow {
  key: string;
  change: 'added' | 'changed' | 'removed';
  cell: string | null;
  department: string | null;
  month: string | null;
  description: string | null;
  recordType: string | null;
  oldAmount: string | null;
  newAmount: string | null;
  fields?: string[];
}

export interface TotalsEffect {
  department: string;
  month: string;
  before: number;
  after: number;
  delta: number;
  pct: number | null;
}

export interface DiffResult {
  counts: { added: number; changed: number; removed: number; unchanged: number; factsAdded: number; factsChanged: number; factsRemoved: number };
  rows: ChangeRow[];
  totals: TotalsEffect[];
  /** Largest relative change of any business-month that already had a value (used by the auto-sync threshold). */
  maxPctChange: number;
}

export function computeDiff(args: {
  plan: { expenses: PlanExpense[]; facts: PlanFact[]; scopes: Scope[]; removeKeys?: string[] };
  currentExpenses: ExpenseFact[];
  currentFacts: { key: string; data: unknown }[];
  ref: RefData;
  settings: Settings;
}): DiffResult {
  const { plan, currentExpenses, currentFacts } = args;
  const curByKey = new Map(currentExpenses.map((e) => [e.key, e]));
  const planKeys = new Set(plan.expenses.map((e) => e.key));
  const rows: ChangeRow[] = [];
  const counts = { added: 0, changed: 0, removed: 0, unchanged: 0, factsAdded: 0, factsChanged: 0, factsRemoved: 0 };

  for (const p of plan.expenses) {
    const c = curByKey.get(p.key);
    if (!c) {
      counts.added++;
      rows.push({ key: p.key, change: 'added', cell: p.cell, department: p.department, month: p.month, description: p.description, recordType: p.recordType, oldAmount: null, newAmount: p.amount ?? p.rawValue });
      continue;
    }
    const fields = expenseChanged(p, c as unknown as Partial<PlanExpense>);
    if (fields.length) {
      counts.changed++;
      rows.push({ key: p.key, change: 'changed', cell: p.cell, department: p.department, month: p.month, description: p.description, recordType: p.recordType, oldAmount: c.amount ?? c.rawValue, newAmount: p.amount ?? p.rawValue, fields });
    } else counts.unchanged++;
  }
  const removeKeys = new Set(args.plan.removeKeys ?? []);
  const removed = currentExpenses.filter((c) => !planKeys.has(c.key) && (removeKeys.has(c.key) || inScope(c.key, plan.scopes, 'expense')));
  for (const c of removed) {
    counts.removed++;
    rows.push({ key: c.key, change: 'removed', cell: c.cell, department: c.department, month: c.month, description: c.description, recordType: c.recordType, oldAmount: c.amount ?? c.rawValue, newAmount: null });
  }

  const curFacts = new Map(currentFacts.map((f) => [f.key, f.data]));
  const planFactKeys = new Set(plan.facts.map((f) => f.key));
  for (const f of plan.facts) {
    if (!curFacts.has(f.key)) counts.factsAdded++;
    else if (factChanged(f, curFacts.get(f.key))) counts.factsChanged++;
  }
  for (const key of curFacts.keys()) if (!planFactKeys.has(key) && inScope(key, plan.scopes, 'fact')) counts.factsRemoved++;

  // Totals effect: derive before and after, compare counted totals per business-month.
  const removedKeys = new Set(removed.map((r) => r.key));
  const after: ExpenseFact[] = [
    ...currentExpenses.filter((c) => !planKeys.has(c.key) && !removedKeys.has(c.key)),
    ...plan.expenses.map((p, i) => ({ ...p, id: `plan-${i}`, batchId: 'plan' }) as unknown as ExpenseFact),
  ];
  const sumBy = (facts: ExpenseFact[]) => {
    const m = new Map<string, Decimal>();
    for (const r of totalsRows(deriveExpenses(facts, new Map(), args.ref, args.settings))) {
      const k = `${r.department ?? '(none)'}|${r.month}`;
      m.set(k, (m.get(k) ?? ZERO).plus(r.amountUsd!));
    }
    return m;
  };
  const b = sumBy(currentExpenses);
  const a = sumBy(after);
  const totals: TotalsEffect[] = [];
  let maxPctChange = 0;
  for (const k of new Set([...b.keys(), ...a.keys()])) {
    const before = b.get(k) ?? ZERO;
    const aft = a.get(k) ?? ZERO;
    if (before.eq(aft)) continue;
    const [department, month] = k.split('|') as [string, string];
    const pct = before.isZero() ? null : aft.minus(before).div(before.abs()).toNumber();
    if (pct !== null) maxPctChange = Math.max(maxPctChange, Math.abs(pct));
    totals.push({ department, month, before: cents(before), after: cents(aft), delta: cents(aft.minus(before)), pct });
  }
  totals.sort((x, y) => x.month.localeCompare(y.month) || x.department.localeCompare(y.department));
  return { counts, rows, totals, maxPctChange };
}
