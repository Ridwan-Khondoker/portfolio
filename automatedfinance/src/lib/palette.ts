// Chart colours from Happy To Deliver's hues (amber, blue, green, purple, orange), validated with the data-viz palette
// checks (lightness band, chroma floor, colour-blind separation, contrast on white):
//   slots 1-5: amber, blue, green, purple, orange; slots 6-7: a deeper green and a lighter blue.
// Worst adjacent CVD ΔE 8.0 (target 8), normal-vision ΔE 22.7 (floor 15), every slot ≥ 3:1 on white.
// Colour follows the business or category, never its rank, and slots are never cycled.

export const SERIES = ['#D97706', '#2563EB', '#0AA17A', '#7C3AED', '#EA580C', '#047554', '#3899E2'] as const;

/** "Shared / Unassigned" business: a neutral slate (deliberately not an identity colour). */
export const NEUTRAL = '#64748B';
/** Folded "All other" slice. Light, so the donut's value list doubles as its table view (contrast relief). */
export const FOLD = '#CBD5E1';

export const INK = '#0F172A';
export const BODY = '#334155';
export const MUTED = '#64748B';
export const GRID = '#EEF0F3';
export const SURFACE = '#FFFFFF';

export function departmentColor(name: string, departments: string[]): string {
  if (/^shared/i.test(name)) return NEUTRAL;
  const named = departments.filter((d) => !/^shared/i.test(d));
  const i = named.indexOf(name);
  return i >= 0 && i < SERIES.length ? SERIES[i]! : NEUTRAL;
}

/** Stable category colours: the seven largest categories over all data get slots 1-7; everything else folds. */
export function categoryColorMap(totalsByCategory: { name: string; amount: number }[]): Map<string, string> {
  const ranked = [...totalsByCategory].filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  return new Map(ranked.slice(0, SERIES.length).map((c, i) => [c.name, SERIES[i]!]));
}
