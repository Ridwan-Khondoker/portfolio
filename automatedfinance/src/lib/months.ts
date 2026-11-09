// Month helpers. A month is identified by "YYYY-MM"; an index (y*12 + m-1) makes ranges easy.

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

export function ymIndex(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return y! * 12 + (m! - 1);
}

export function indexYm(i: number): string {
  const y = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function ymOf(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function monthLabel(ym: string, long = false): string {
  const [y, m] = ym.split('-').map(Number);
  return long ? `${MONTH_NAMES[m! - 1]} ${y}` : `${MONTH_SHORT[m! - 1]} ${String(y).slice(2)}`;
}

export function addMonths(ym: string, n: number): string {
  return indexYm(ymIndex(ym) + n);
}

export function isYm(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function isYmd(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** "January", "jan", "May " -> 1..12 */
export function parseMonthName(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\.$/, '');
  if (t.length < 3) return null;
  const i = MONTH_NAMES.findIndex(
    (m) => m.toLowerCase() === t || (t.length === 3 && m.toLowerCase().startsWith(t)) || (t === 'sept' && m === 'September'),
  );
  return i < 0 ? null : i + 1;
}

export function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Days from a to b (YYYY-MM-DD), i.e. b - a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function addDays(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
