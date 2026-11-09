// Server-only spreadsheet access (SheetJS). Reads stored cell values only; formulas are never evaluated,
// and error values (#REF!, #VALUE!, ...) are surfaced as errors, never as numbers.
import * as XLSX from 'xlsx';

export type CellKind = 'blank' | 'number' | 'text' | 'error' | 'bool';

export interface Cell {
  kind: CellKind;
  num?: number;
  text?: string;
  formula?: string;
  isDate?: boolean;
}

export interface Sheet {
  name: string;
  maxRow: number;
  maxCol: number;
  ws: XLSX.WorkSheet;
}

export interface Book {
  sheets: Sheet[];
}

export function readBook(buf: Buffer, fileName: string): Book {
  const isCsv = /\.csv$/i.test(fileName);
  const wb = XLSX.read(buf, {
    type: 'buffer',
    cellFormula: true,
    cellDates: false,
    cellNF: true,
    cellStyles: false,
    dense: false,
    raw: isCsv ? false : undefined,
  });
  const sheets: Sheet[] = wb.SheetNames.map((name, i) => {
    const ws = wb.Sheets[name]!;
    const ref = ws['!ref'];
    const range = ref ? XLSX.utils.decode_range(ref) : { s: { r: 0, c: 0 }, e: { r: -1, c: -1 } };
    const sheetName = isCsv && wb.SheetNames.length === 1 && i === 0 ? fileName.replace(/\.[^.]+$/, '').slice(0, 80) : name;
    return { name: sheetName, maxRow: range.e.r + 1, maxCol: range.e.c + 1, ws };
  });
  return { sheets };
}

export function colIndex(letter: string): number {
  return XLSX.utils.decode_col(letter.toUpperCase()) + 1;
}

export function colLetter(index: number): string {
  return XLSX.utils.encode_col(index - 1);
}

export function cellRef(col: string, row: number): string {
  return `${col.toUpperCase()}${row}`;
}

export function getCell(sheet: Sheet, row: number, col: string | number): Cell {
  const c = typeof col === 'number' ? col : colIndex(col);
  const addr = XLSX.utils.encode_cell({ r: row - 1, c: c - 1 });
  const cell = sheet.ws[addr] as XLSX.CellObject | undefined;
  if (!cell || cell.t === 'z' || cell.v === undefined || cell.v === null) return { kind: 'blank', formula: cell?.f };
  if (cell.t === 'e') return { kind: 'error', text: String(cell.w ?? XLSX.SSF.format('General', cell.v as number) ?? '#ERROR'), formula: cell.f };
  if (cell.t === 'n') {
    const isDate = typeof cell.z === 'string' && XLSX.SSF.is_date(cell.z);
    return { kind: 'number', num: cell.v as number, formula: cell.f, isDate };
  }
  if (cell.t === 'b') return { kind: 'bool', text: String(cell.v), formula: cell.f };
  if (cell.t === 'd') {
    const d = cell.v as Date;
    return { kind: 'text', text: d.toISOString().slice(0, 10), formula: cell.f };
  }
  const text = String(cell.v);
  if (text.trim() === '') return { kind: 'blank', formula: cell.f };
  if (/^#(REF!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!|NULL!|ERROR!)$/.test(text.trim())) return { kind: 'error', text: text.trim(), formula: cell.f };
  return { kind: 'text', text, formula: cell.f };
}

/** Trimmed display text of any cell ("" for blanks). Numbers render like the sheet shows plain numbers (911 -> "911"). */
export function textOf(sheet: Sheet, row: number, col: string | number): string {
  const c = getCell(sheet, row, col);
  if (c.kind === 'blank') return '';
  if (c.kind === 'number') return String(c.num);
  return (c.text ?? '').trim();
}

/** Excel serial -> YYYY-MM-DD */
export function serialToYmd(serial: number): string | null {
  const p = XLSX.SSF.parse_date_code(serial);
  if (!p || !p.y) return null;
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Accepts a date cell, an ISO date, M/D/YYYY or D Month YYYY text. */
export function cellToYmd(cell: Cell): string | null {
  if (cell.kind === 'number' && cell.num !== undefined) {
    if (cell.num > 20000 && cell.num < 80000) return serialToYmd(cell.num);
    return null;
  }
  if (cell.kind !== 'text' || !cell.text) return null;
  const t = cell.text.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = +m[3]! < 100 ? 2000 + +m[3]! : +m[3]!;
    return valid(y, +m[1]!, +m[2]!);
  }
  const parsed = Date.parse(`${t} UTC`);
  if (!Number.isNaN(parsed) && /[a-z]/i.test(t) && /\d{4}/.test(t)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

function valid(y: number, m: number, d: number): string | null {
  const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dt = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === s ? s : null;
}

/** Sparse map of every numeric and error cell, kept per import so reconciliation can read any source range later. */
export function snapshotSheet(sheet: Sheet): { cells: Record<string, string>; errors: Record<string, string> } {
  // Values are kept as exact strings: JSON numbers can lose their last digit on a database round trip.
  const cells: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const [addr, raw] of Object.entries(sheet.ws)) {
    if (addr.startsWith('!')) continue;
    const cell = raw as XLSX.CellObject;
    if (cell.t === 'n' && typeof cell.v === 'number') cells[addr] = String(cell.v);
    else if (cell.t === 'e') errors[addr] = String(cell.w ?? '#ERROR');
    else if (cell.t === 's' && typeof cell.v === 'string' && /^#(REF!|VALUE!|DIV\/0!|N\/A|NAME\?|NUM!|NULL!|ERROR!)$/.test(cell.v.trim()))
      errors[addr] = cell.v.trim();
  }
  return { cells, errors };
}

export function utils() {
  return XLSX.utils;
}

export { XLSX };
