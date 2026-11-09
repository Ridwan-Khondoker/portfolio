// Live tie-outs: imported totals vs the total rows inside each source tab and vs the P&L tabs.
import { Decimal, ZERO, cents } from '@/lib/money';
import { totalsRows } from './derive';
import type { DerivedExpense, RevenueFact } from './types';

export interface SourceRef {
  sheet: string;
  year: number;
  ranges: string[];
}

export interface CheckDef {
  id: string;
  name: string;
  periodLabel: string;
  periodStart: string; // YYYY-MM
  periodEnd: string; // YYYY-MM
  measure: 'expenses' | 'revenue' | 'manual';
  department: string | null;
  sourceRefs: SourceRef[];
  sourceLabel: string;
  explanation: string | null;
  explainedDifference: string | null;
}

export interface SheetSnapshot {
  cells: Record<string, string | number>;
  errors: Record<string, string>;
}

export interface CheckResult {
  id: string;
  name: string;
  periodLabel: string;
  master: number;
  source: number | null;
  difference: number | null;
  status: 'OK' | 'EXPLAINED' | 'CHECK';
  sourceLabel: string;
  explanation: string | null;
  problem: string | null;
}

function colToNum(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function numToCol(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Sum of numeric cells in "C41:N41" or "S24". Error cells make the total untrustworthy. */
export function sumRange(snap: SheetSnapshot, range: string): { total: Decimal; errors: string[] } {
  const [a, b] = range.split(':') as [string, string | undefined];
  const pa = a.match(/^([A-Z]+)(\d+)$/i);
  const pb = (b ?? a).match(/^([A-Z]+)(\d+)$/i);
  if (!pa || !pb) return { total: ZERO, errors: [`bad range ${range}`] };
  let total = ZERO;
  const errors: string[] = [];
  for (let r = Number(pa[2]); r <= Number(pb[2]); r++) {
    for (let c = colToNum(pa[1]!); c <= colToNum(pb[1]!); c++) {
      const ref = `${numToCol(c)}${r}`;
      if (snap.errors[ref]) errors.push(`${ref} = ${snap.errors[ref]}`);
      else if (snap.cells[ref] !== undefined && snap.cells[ref] !== null && snap.cells[ref] !== '') total = total.plus(String(snap.cells[ref]));
    }
  }
  return { total, errors };
}

export function runChecks(args: {
  checks: CheckDef[];
  rows: DerivedExpense[];
  revenue: RevenueFact[];
  sheets: Map<string, SheetSnapshot>; // key "sheet|year"
}): CheckResult[] {
  const counted = totalsRows(args.rows);
  return args.checks.map((c) => {
    const inPeriod = (m: string | null) => !!m && m >= c.periodStart && m <= c.periodEnd;
    const okDept = (d: string | null) => !c.department || d === c.department;
    let master = ZERO;
    let source: Decimal | null = ZERO;
    let problem: string | null = null;
    if (c.measure === 'revenue') {
      master = args.revenue.filter((r) => inPeriod(r.month) && okDept(r.department) && r.amount !== null).reduce((a, r) => a.plus(r.amount!), ZERO);
    } else if (c.measure === 'manual') {
      const manual = args.rows.filter((r) => r.kind === 'MANUAL');
      master = counted.filter((r) => r.kind === 'MANUAL').reduce((a, r) => a.plus(r.amountUsd!), ZERO);
      source = manual.filter((r) => r.amountUsd && r.month).reduce((a, r) => a.plus(r.amountUsd!), ZERO);
    } else {
      master = counted.filter((r) => inPeriod(r.month) && okDept(r.department)).reduce((a, r) => a.plus(r.amountUsd!), ZERO);
    }
    if (c.measure !== 'manual') {
      for (const ref of c.sourceRefs) {
        const snap = args.sheets.get(`${ref.sheet}|${ref.year}`);
        if (!snap) {
          problem = `No import of “${ref.sheet}” for ${ref.year} yet.`;
          source = null;
          break;
        }
        for (const range of ref.ranges) {
          const r = sumRange(snap, range);
          if (r.errors.length) {
            problem = `Source cells hold errors (${r.errors.slice(0, 3).join(', ')}); the source total can't be trusted.`;
            source = null;
            break;
          }
          source = source!.plus(r.total);
        }
        if (source === null) break;
      }
    }
    const masterC = cents(master);
    const sourceC = source === null ? null : cents(source);
    // Totals are compared as shown (to the cent), like the workbook's tie-out.
    const diff = sourceC === null ? null : new Decimal(masterC).minus(sourceC);
    let status: CheckResult['status'] = 'CHECK';
    if (diff !== null && diff.isZero()) status = 'OK';
    // An explained difference still applies while the difference is exactly the one that was explained.
    else if (diff !== null && c.explainedDifference !== null && diff.eq(cents(new Decimal(c.explainedDifference)))) status = 'EXPLAINED';
    if (diff !== null && status === 'CHECK' && c.explainedDifference !== null && !problem) problem = 'The difference no longer matches the one that was explained; review it.';
    return {
      id: c.id,
      name: c.name,
      periodLabel: c.periodLabel,
      master: masterC,
      source: sourceC,
      difference: diff === null ? null : cents(diff),
      status,
      sourceLabel: c.sourceLabel,
      explanation: c.explanation,
      problem,
    };
  });
}

// ------------------------------------------------------------------ parsing check definitions (seed / settings)

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Jan-Dec 26" -> [2026-01, 2026-12]; "All" -> whole range. */
export function parsePeriod(label: string): { start: string; end: string } {
  const m = label.trim().toLowerCase().match(/^([a-z]{3})\s*-\s*([a-z]{3})\s+(\d{2,4})$/);
  if (!m) return { start: '1900-01', end: '2999-12' };
  const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const a = MONTHS.indexOf(m[1]!) + 1;
  const b = MONTHS.indexOf(m[2]!) + 1;
  return { start: `${y}-${String(a).padStart(2, '0')}`, end: `${y}-${String(b).padStart(2, '0')}` };
}

/** "HTD!C41:N41", "LUX!C73:J73 + C19:F21", "P&L 2025!S3:S7" with sheet aliases (e.g. 4OL -> FOUR OUR LIVING). */
export function parseSourceRefs(text: string, year: number, aliases: Record<string, string>, sheets: string[]): SourceRef[] {
  const refs: SourceRef[] = [];
  let currentSheet: string | null = null;
  for (const part of text.split('+').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(.*)!([A-Z]+\d+(?::[A-Z]+\d+)?)$/i);
    let range: string;
    if (m) {
      const name = m[1]!.trim();
      currentSheet = sheets.find((s) => s.toLowerCase() === name.toLowerCase()) ?? aliases[name] ?? aliases[name.toUpperCase()] ?? name;
      range = m[2]!.toUpperCase();
    } else range = part.toUpperCase();
    if (!currentSheet || !/^[A-Z]+\d+(:[A-Z]+\d+)?$/.test(range)) continue;
    const sheetYear = Number(currentSheet.match(/20\d{2}/)?.[0] ?? year);
    const existing = refs.find((r) => r.sheet === currentSheet && r.year === sheetYear);
    if (existing) existing.ranges.push(range);
    else refs.push({ sheet: currentSheet, year: sheetYear, ranges: [range] });
  }
  return refs;
}

export function checkFromRow(
  row: { check: string; period: string; master_total: string; source_total: string; source_cells: string; status: string; explanation: string },
  departments: string[],
  aliases: Record<string, string>,
  sheets: string[],
): Omit<CheckDef, 'id'> {
  const name = row.check.trim();
  const { start, end } = parsePeriod(row.period);
  const lower = name.toLowerCase();
  const measure: CheckDef['measure'] = lower.startsWith('revenue') ? 'revenue' : lower.startsWith('manual') ? 'manual' : 'expenses';
  const dept = [...departments].sort((a, b) => b.length - a.length).find((d) => lower.startsWith(d.toLowerCase() + ' ')) ?? null;
  const sourceRefs = measure === 'manual' ? [] : parseSourceRefs(row.source_cells, Number(start.slice(0, 4)), aliases, sheets);
  const explained = row.status === 'EXPLAINED' && row.master_total && row.source_total ? new Decimal(row.master_total).minus(row.source_total).toString() : null;
  return {
    name,
    periodLabel: row.period,
    periodStart: start,
    periodEnd: end,
    measure,
    department: dept,
    sourceRefs,
    sourceLabel: row.source_cells,
    explanation: row.explanation || null,
    explainedDifference: explained,
  };
}
