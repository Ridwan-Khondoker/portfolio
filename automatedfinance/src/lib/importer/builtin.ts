// Turns a source_layouts.json description (kept with the confidential data, not in git) plus the workbook it describes
// into saved layout profiles. Row numbers in the description become label-based rules, so later uploads survive
// inserted rows.
import { findGridBlocks, norm, profileIdFor } from './detect';
import { getCell, textOf, type Book, type Sheet } from './workbook';
import type { GridConfig, PlConfig, Profile, RecurringConfig, SnapshotConfig } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Layouts = any;

export interface BuiltinHints {
  /** Display-id prefix per source sheet, e.g. { "HTD LA": "LA" }. */
  idPrefixBySheet?: Record<string, string>;
  /** Revenue record-type label per P&L sheet. */
  revenueRecordTypeBySheet?: Record<string, string>;
}

function expandRowKeys(spec: Record<string, string>): Map<number, string> {
  const out = new Map<number, string>();
  for (const [k, v] of Object.entries(spec)) {
    const m = k.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let r = a; r <= b; r++) out.set(r, v);
  }
  return out;
}

function labelAt(sheet: Sheet, row: number, catCol: string, itemCol: string): string {
  return `${textOf(sheet, row, catCol)}|${textOf(sheet, row, itemCol)}`;
}

function endMarkerAfter(sheet: Sheet, headerRow: number, lastRow: number, catCol: string, itemCol: string) {
  for (let r = lastRow + 1; r <= Math.min(sheet.maxRow, lastRow + 25); r++) {
    const a = textOf(sheet, r, catCol);
    const b = textOf(sheet, r, itemCol);
    const label = a.trim() || b.trim();
    if (label) return { label, offset: r - headerRow };
  }
  return undefined;
}

export function builtinProfiles(layouts: Layouts, book: Book, hints: BuiltinHints = {}): Profile[] {
  const sheetByName = new Map(book.sheets.map((s) => [s.name, s]));
  const profiles: Profile[] = [];
  const usedBlocks = new Map<string, Set<number>>();

  const recordTypeFor = (g: any) => String(g.record_type);
  const roleFor = (g: any) => (g.counted === 'only_if_actual_payroll' ? 'ACTUAL' : g.counted === 'only_if_no_actual_payroll' ? 'ESTIMATE' : 'ALWAYS');

  for (const g of layouts.expense_grids as any[]) {
    const sheet = sheetByName.get(g.sheet);
    if (!sheet) throw new Error(`Layout refers to tab “${g.sheet}”, which is not in the workbook.`);
    if (g.department_col) continue; // P&L summary rows: handled with the P&L profile below
    const block = findGridBlocks(sheet).find((b) => b.headerRow === g.header_row);
    if (!block) throw new Error(`No Category/Item/month header found at ${g.sheet} row ${g.header_row}.`);
    if (!usedBlocks.has(g.sheet)) usedBlocks.set(g.sheet, new Set());
    usedBlocks.get(g.sheet)!.add(g.header_row);
    const [first, last] = g.rows as [number, number];
    const catCol = g.category_col ?? block.catCol;
    const itemCol = g.item_col ?? block.itemCol;
    const config: GridConfig = {
      kind: 'GRID',
      department: g.department,
      year: g.year ?? null,
      recordType: recordTypeFor(g),
      countRole: roleFor(g),
      countGroup: g.block ? g.sheet : undefined,
      title: block.title,
      catCol,
      itemCol,
      monthCols: g.month_cols ?? block.monthCols,
      firstOffset: first - g.header_row,
      lastOffset: last - g.header_row,
      endMarker: endMarkerAfter(sheet, g.header_row, last, catCol, itemCol),
      totalRowOffset: g.total_row_for_reconciliation ? g.total_row_for_reconciliation - g.header_row : undefined,
      categoryOverride: g.category_override,
      idPrefix: hints.idPrefixBySheet?.[g.sheet],
    };
    if (g.actual_payroll_rows) {
      const [a, b] = g.actual_payroll_rows as [number, number];
      config.triggerLines = [];
      for (let r = a; r <= b; r++) config.triggerLines.push(labelAt(sheet, r, catCol, itemCol));
    }
    if (g.category_overrides_by_row) {
      config.categoryOverridesByLine = {};
      for (const [r, cat] of expandRowKeys(g.category_overrides_by_row)) config.categoryOverridesByLine[labelAt(sheet, r, catCol, itemCol)] = cat;
    }
    if (g.vendor_override_rows) {
      config.vendorOverridesByLine = {};
      for (const [r, v] of expandRowKeys(g.vendor_override_rows)) config.vendorOverridesByLine[labelAt(sheet, r, catCol, itemCol)] = v;
    }
    profiles.push({
      id: profileIdFor(g.sheet, block.signature),
      name: `${g.sheet} · ${block.title || 'grid'}${g.block ? ` (${g.block})` : ''}`,
      tabName: g.sheet,
      signature: block.signature,
      kind: 'GRID',
      config,
      builtin: true,
    });
  }

  // Other grid blocks in the same tabs (e.g. a top summary that repeats the breakdown) are recognised but not imported.
  for (const [sheetName, rows] of usedBlocks) {
    const sheet = sheetByName.get(sheetName)!;
    for (const block of findGridBlocks(sheet)) {
      if (rows.has(block.headerRow)) continue;
      profiles.push({
        id: profileIdFor(sheetName, block.signature),
        name: `${sheetName} · ${block.title || 'grid'} (not imported)`,
        tabName: sheetName,
        signature: block.signature,
        kind: 'GRID',
        config: {
          kind: 'GRID',
          skip: true,
          skipReason: 'Summary block that repeats lines imported from another block in this tab',
          department: '',
          year: null,
          recordType: 'Recorded (source grid)',
          countRole: 'ALWAYS',
          title: block.title,
          catCol: block.catCol,
          itemCol: block.itemCol,
          monthCols: block.monthCols,
          firstOffset: 1,
          lastOffset: 1,
        },
        builtin: true,
      });
    }
  }

  // P&L tabs: optional summary expense rows + revenue rows.
  const plSheets = new Set<string>();
  for (const g of layouts.expense_grids as any[]) if (g.department_col) plSheets.add(g.sheet);
  for (const r of layouts.revenue as any[]) plSheets.add(r.sheet);
  for (const name of plSheets) {
    const sheet = sheetByName.get(name);
    if (!sheet) throw new Error(`Layout refers to tab “${name}”, which is not in the workbook.`);
    const exp = (layouts.expense_grids as any[]).find((g) => g.sheet === name && g.department_col);
    const rev = (layouts.revenue as any[]).find((r) => r.sheet === name);
    const labelCol = exp?.department_col ?? 'E';
    const rowsOf = (spec: Record<string, string> | undefined) =>
      Object.entries(spec ?? {}).map(([row, department]) => ({ row: Number(row), department, label: textOf(sheet, Number(row), labelCol) }));
    const config: PlConfig = {
      kind: 'PL',
      monthCols: exp?.month_cols ?? rev?.month_cols,
      labelCol,
      expenseRows: rowsOf(exp?.row_departments),
      revenueRows: rowsOf(rev?.row_departments),
      expenseCategory: exp?.category_override ?? 'Unitemized (P&L summary)',
      expenseRecordType: exp?.record_type ?? 'Summary (no line detail)',
      revenueRecordType: hints.revenueRecordTypeBySheet?.[name] ?? 'P&L figure',
      idPrefix: hints.idPrefixBySheet?.[name],
    };
    profiles.push({ id: profileIdFor(name, 'pl'), name: `${name} (P&L)`, tabName: name, signature: 'pl', kind: 'PL', config, builtin: true });
  }

  // Current subscriptions / services list and domain renewals.
  if (layouts.recurring_list) {
    const rl = layouts.recurring_list;
    const firstRow = Math.min(...(rl.rows as [number, number][]).map((x) => x[0]));
    const config: RecurringConfig = {
      kind: 'RECURRING',
      nameCol: rl.name_col,
      detailCols: [rl.detail_col, ...(rl.note_cols ?? []).slice(0, 1)],
      amountCol: rl.amount_col,
      noteCols: rl.note_cols ?? [],
      firstRow,
      domains: layouts.domains
        ? {
            domainCol: layouts.domains.domain_col,
            priceCol: layouts.domains.price_col,
            renewalCol: layouts.domains.renewal_col,
            noteCol: layouts.domains.note_col,
            firstRow: layouts.domains.rows[0],
          }
        : undefined,
    };
    profiles.push({ id: profileIdFor(rl.sheet, 'recurring'), name: `${rl.sheet} (recurring list)`, tabName: rl.sheet, signature: 'recurring', kind: 'RECURRING', config, builtin: true });
  }

  // Point-in-time run-rate snapshot: compared against the recurring list, never counted as expenses.
  if (layouts.october_snapshot?.tech_ops_list) {
    const s = layouts.october_snapshot;
    const t = s.tech_ops_list;
    const sheet = sheetByName.get(s.sheet);
    const config: SnapshotConfig = {
      kind: 'SNAPSHOT',
      nameCol: t.name_col,
      detailCol: t.detail_col,
      monthlyCol: t.monthly_col,
      annualCol: t.annual_col,
      paymentCol: t.payment_method_col,
      chargeDateCol: t.charge_date_col,
      firstRow: t.rows[0],
    };
    if (sheet) {
      // Semi-monthly / semi-annual columns sit next to the monthly/annual ones in the header row above the list.
      for (let r = t.rows[0] - 1; r >= Math.max(1, t.rows[0] - 4); r--) {
        for (let c = 1; c <= sheet.maxCol; c++) {
          const v = norm(textOf(sheet, r, c));
          const letter = getCell(sheet, r, c).kind === 'text' ? colLetterSafe(c) : null;
          if (!letter) continue;
          if (v === 'semi monthly') config.semiMonthlyCol = letter;
          if (v === 'semi annually' || v === 'semi annual') config.semiAnnualCol = letter;
        }
      }
    }
    profiles.push({ id: profileIdFor(s.sheet, 'snapshot'), name: `${s.sheet} (run-rate snapshot)`, tabName: s.sheet, signature: 'snapshot', kind: 'SNAPSHOT', config, builtin: true });
  }

  // Tabs listed as not imported: "Tab name (reason)".
  for (const entry of (layouts.not_imported ?? []) as string[]) {
    const m = entry.match(/^(.*?)\s*\((.*)\)\s*$/);
    const tab = (m ? m[1] : entry)!.trim();
    if (!sheetByName.has(tab) || profiles.some((p) => p.tabName === tab)) continue;
    profiles.push({ id: profileIdFor(tab, 'ignore'), name: `${tab} (not imported)`, tabName: tab, signature: 'ignore', kind: 'IGNORE', config: { kind: 'IGNORE', reason: m ? m[2]! : 'Not imported' }, builtin: true });
  }
  return profiles;
}

function colLetterSafe(c: number): string {
  let s = '';
  let n = c;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
