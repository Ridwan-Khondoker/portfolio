// Decimal-safe money. Amounts are kept at full source precision and rounded only for display,
// which is how the source workbook computes its totals (e.g. 69,219.853 shows as 69,219.85).
import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export const ZERO = new Decimal(0);

export function dec(v: Decimal.Value | null | undefined): Decimal {
  if (v === null || v === undefined || v === '') return ZERO;
  return new Decimal(v);
}

export function sumDec(values: Iterable<Decimal | null | undefined>): Decimal {
  let s = ZERO;
  for (const v of values) if (v) s = s.plus(v);
  return s;
}

/** Number rounded to cents (for JSON, charts and comparisons). */
export function cents(v: Decimal | null | undefined): number {
  if (!v) return 0;
  return v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function toNum(v: Decimal | null | undefined): number {
  return v ? v.toNumber() : 0;
}

/** A JS number from a spreadsheet, as the exact decimal string of that double (shortest round-trip form). */
export function numToDecString(n: number): string {
  return new Decimal(String(n)).toString();
}

const MINUS = '−';

export function fmtUsd(v: number | null | undefined, opts: { cents?: boolean; compact?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  const abs = Math.abs(v);
  if (opts.compact && abs >= 1000) {
    const s =
      abs >= 1_000_000
        ? `${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
        : `${(abs / 1000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
    return `${v < 0 ? MINUS : ''}$${s}`;
  }
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: opts.cents ? 2 : 0, maximumFractionDigits: opts.cents ? 2 : 0 });
  return v < 0 ? `($${str})` : `$${str}`;
}

export function fmtPct(v: number | null | undefined, digits = 1, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'n/a';
  const s = (v * 100).toFixed(digits) + '%';
  return signed && v > 0 ? `+${s}` : s.replace('-', MINUS);
}
