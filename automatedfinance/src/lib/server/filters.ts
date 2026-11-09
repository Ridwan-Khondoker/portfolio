import { addMonths, isYm } from '@/lib/months';
import type { Filters } from '@/lib/finance/dashboard';

export type SearchParams = Record<string, string | string[] | undefined>;

export function sp(params: SearchParams, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Global filters live in the URL (?start=2025-09&end=2026-11&dept=HTD&cat=...&status=...). */
export function parseFilters(
  params: SearchParams,
  ctx: { current: string; firstMonth: string | null; departments: string[]; categories: string[] },
): Filters {
  const start = sp(params, 'start');
  const end = sp(params, 'end');
  const dept = sp(params, 'dept');
  const cat = sp(params, 'cat');
  const status = sp(params, 'status');
  return {
    start: isYm(start) ? start : (ctx.firstMonth ?? addMonths(ctx.current, -11)),
    end: isYm(end) ? end : ctx.current,
    department: dept && ctx.departments.includes(dept) ? dept : 'All',
    category: cat && ctx.categories.includes(cat) ? cat : 'All',
    status: status && ['Paid', 'Pending', 'Overdue', 'Not recorded'].includes(status) ? status : 'All',
  };
}

export function filterQuery(f: Partial<Filters>): string {
  const q = new URLSearchParams();
  if (f.start) q.set('start', f.start);
  if (f.end) q.set('end', f.end);
  if (f.department && f.department !== 'All') q.set('dept', f.department);
  if (f.category && f.category !== 'All') q.set('cat', f.category);
  if (f.status && f.status !== 'All') q.set('status', f.status);
  const s = q.toString();
  return s ? `?${s}` : '';
}
