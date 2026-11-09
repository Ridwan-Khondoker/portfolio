import crypto from 'node:crypto';
import { parseMonthName } from '@/lib/months';
import { colLetter, getCell, textOf, type Sheet } from './workbook';
import { TXN_FIELDS, TXN_HEADERS, type TxnField } from './types';

export interface DetectedBlock {
  headerRow: number;
  title: string;
  catCol: string;
  itemCol: string;
  monthCols: string[];
  signature: string;
}

export function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Deterministic id for a layout profile, so keys stay stable if a profile is recreated. */
export function profileIdFor(tabName: string, signature: string): string {
  return 'lp_' + crypto.createHash('sha256').update(`${tabName}\n${signature}`).digest('hex').slice(0, 16);
}

export function yearInName(name: string): number | null {
  const m = name.match(/(?:^|[^\d])(20\d{2})(?:[^\d]|$)/);
  return m ? Number(m[1]) : null;
}

export function baseTabName(name: string): string {
  return name.replace(/(^|\s|-|_)20\d{2}(?=$|\s|-|_)/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Grid header rows: a "Category" cell, an "Item" cell and January..December in order to their right.
 * One blank spacer column is allowed between consecutive months (as in FOUR OUR LIVING).
 */
export function findGridBlocks(sheet: Sheet): DetectedBlock[] {
  const blocks: DetectedBlock[] = [];
  const maxCol = Math.min(sheet.maxCol, 60);
  for (let r = 1; r <= sheet.maxRow; r++) {
    let catCol: number | null = null;
    let itemCol: number | null = null;
    let janCol: number | null = null;
    for (let c = 1; c <= maxCol; c++) {
      const t = norm(textOf(sheet, r, c));
      if (!t) continue;
      if (t === 'category' && catCol === null) catCol = c;
      else if (t === 'item' && itemCol === null) itemCol = c;
      else if (parseMonthName(t) === 1 && janCol === null) janCol = c;
    }
    if (catCol === null || itemCol === null || janCol === null || janCol < itemCol) continue;
    const months: number[] = [janCol];
    let c = janCol;
    for (let m = 2; m <= 12; m++) {
      let next: number | null = null;
      for (const step of [1, 2]) {
        const cand = c + step;
        const t = textOf(sheet, r, cand);
        if (step === 2 && textOf(sheet, r, c + 1) !== '') break; // the spacer must be empty
        if (parseMonthName(t) === m) {
          next = cand;
          break;
        }
      }
      if (next === null) break;
      months.push(next);
      c = next;
    }
    if (months.length !== 12) continue;
    const title = blockTitle(sheet, r, itemCol);
    const monthCols = months.map(colLetter);
    blocks.push({
      headerRow: r,
      title,
      catCol: colLetter(catCol),
      itemCol: colLetter(itemCol),
      monthCols,
      signature: `grid|${norm(title)}|${colLetter(catCol)}${colLetter(itemCol)}|${monthCols.join('')}`,
    });
  }
  // Two blocks with an identical signature in one tab get an ordinal so each maps separately.
  const seen = new Map<string, number>();
  for (const b of blocks) {
    const n = (seen.get(b.signature) ?? 0) + 1;
    seen.set(b.signature, n);
    if (n > 1) b.signature += `#${n}`;
  }
  return blocks;
}

function blockTitle(sheet: Sheet, headerRow: number, itemCol: number): string {
  for (let r = headerRow - 1; r >= Math.max(1, headerRow - 3); r--) {
    for (let c = 1; c <= itemCol + 1; c++) {
      const t = textOf(sheet, r, c);
      if (t) return t.trim();
    }
  }
  return '';
}

/** Header row of an Expense Entry style list: returns the column letter for each recognised field. */
export function findTransactionHeader(sheet: Sheet): { headerRow: number; columns: Partial<Record<TxnField, string>> } | null {
  const wanted = new Map<string, TxnField>();
  for (const f of TXN_FIELDS) wanted.set(norm(TXN_HEADERS[f]), f);
  // Common variants.
  wanted.set('amount (usd)', 'amount');
  wanted.set('date', 'transactionDate');
  wanted.set('department', 'department');
  wanted.set('category', 'category');
  wanted.set('description', 'description');
  wanted.set('vendor', 'vendor');
  wanted.set('reference', 'reference');
  wanted.set('invoice #', 'reference');
  wanted.set('status', 'paymentStatus');
  for (let r = 1; r <= Math.min(sheet.maxRow, 40); r++) {
    const columns: Partial<Record<TxnField, string>> = {};
    for (let c = 1; c <= Math.min(sheet.maxCol, 40); c++) {
      const t = norm(textOf(sheet, r, c));
      const f = wanted.get(t);
      if (f && !columns[f]) columns[f] = colLetter(c);
    }
    if (columns.transactionDate && columns.amount && (columns.description || columns.vendor) && Object.keys(columns).length >= 5)
      return { headerRow: r, columns };
  }
  return null;
}

export function transactionSignature(columns: Partial<Record<TxnField, string>>): string {
  return 'txn|' + TXN_FIELDS.map((f) => `${f}:${columns[f] ?? '-'}`).join(',');
}

export function isSheetEmpty(sheet: Sheet): boolean {
  for (let r = 1; r <= Math.min(sheet.maxRow, 200); r++)
    for (let c = 1; c <= Math.min(sheet.maxCol, 40); c++) if (getCell(sheet, r, c).kind !== 'blank') return false;
  return true;
}
