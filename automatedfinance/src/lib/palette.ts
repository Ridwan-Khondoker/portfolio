// Chart colours, built from Happy To Deliver's own brand tokens (happytodeliver.com) and validated with the
// data-viz palette checks (lightness band, chroma floor, colour-blind separation, contrast on white):
//   slots 1-5 are HTD's dark gold, blue, signal green, resident purple and provider orange;
//   slots 6-7 are a deeper HTD green and a lighter HTD blue.
// Worst adjacent CVD ΔE 8.0 (target 8), normal-vision ΔE 22.7 (floor 15), every slot ≥ 3:1 on white.
// Colour follows the business or category, never its rank, and slots are never cycled.

export const SERIES = ['#B7830A', '#2563EB', '#0AA17A', '#7C3AED', '#EA580C', '#047554', '#3899E2'] as const;

/** "Shared / Unassigned" business: HTD muted neutral (it is deliberately not an identity colour). */
export const NEUTRAL = '#857F74';
/** Folded "All other" slice. Light, so the donut's value list doubles as its table view (contrast relief). */
export const FOLD = '#CBBFA6';

export const INK = '#161513';
export const BODY = '#44413B';
export const MUTED = '#857F74';
export const GRID = '#ECE7DA';
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
