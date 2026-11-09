// Subscriptions & services list (from the recurring-list tab), compared with the October run-rate snapshot.
import { Decimal, ZERO, cents } from '@/lib/money';
import { daysBetween } from '@/lib/months';
import { normLabel } from './derive';

export const FREQUENCIES: { name: string; perMonth: Decimal }[] = [
  { name: 'Monthly', perMonth: new Decimal(1) },
  { name: 'Semi-Monthly', perMonth: new Decimal(2) },
  { name: 'Bi-Weekly', perMonth: new Decimal(26).div(12) },
  { name: 'Weekly', perMonth: new Decimal(52).div(12) },
  { name: 'Quarterly', perMonth: new Decimal(1).div(3) },
  { name: 'Every 4 months', perMonth: new Decimal(1).div(4) },
  { name: 'Semi-Annual', perMonth: new Decimal(1).div(6) },
  { name: 'Annual', perMonth: new Decimal(1).div(12) },
  { name: 'One-Time', perMonth: ZERO },
];

export function perMonth(freq: string): Decimal {
  return FREQUENCIES.find((f) => f.name === freq)?.perMonth ?? new Decimal(1);
}

export interface RecurringFactData {
  itemKey: string;
  name: string;
  detail: string;
  notes: string;
  listed: string;
  amount: string | null;
  frequency: string;
  sourceCell: string;
  order: number;
}

export interface SnapshotItemData {
  itemKey: string;
  name: string;
  detail: string;
  monthly: string | null;
  paymentMethod: string;
  chargeDate: string;
  sourceCell: string;
  order: number;
}

export interface ItemMeta {
  itemKey: string;
  department: string | null;
  snapshotMatch: string | null; // snapshot itemKey, or '' for "no match"
  frequency: string | null;
}

export interface RecurringRow {
  itemKey: string;
  name: string;
  detail: string;
  notes: string;
  listed: string;
  frequency: string;
  monthly: number;
  department: string;
  status: 'Active' | 'Amount unknown' | 'No amount listed' | '$0 / inactive';
  snapshot: { name: string; monthly: number | null; paymentMethod: string; chargeDate: string } | null;
  changeVsSnapshot: number | null;
  sourceCell: string;
}

export function guessDepartment(text: string, departments: string[]): string {
  const t = ` ${text.toLowerCase()} `;
  const alias: [RegExp, string][] = [
    [/\b(4ol|4our|four our)\b/, '4our Living'],
    [/\blux/, 'LUX Life'],
    [/\btribe\b/, 'Tribe Entertainment'],
    [/\bhtd la\b|\bla\b/, 'HTD LA'],
    [/\bhtd\b/, 'HTD'],
  ];
  for (const [re, d] of alias) if (re.test(t) && departments.includes(d)) return d;
  return departments.find((d) => d.startsWith('Shared')) ?? 'Shared / Unassigned';
}

export function buildRecurring(args: {
  items: RecurringFactData[];
  snapshot: SnapshotItemData[];
  meta: ItemMeta[];
  departments: string[];
}): { rows: RecurringRow[]; totalMonthly: number; totalMonthlyDec: Decimal; missingFromCurrent: SnapshotItemData[] } {
  const metaBy = new Map(args.meta.map((m) => [m.itemKey, m]));
  const snapBy = new Map(args.snapshot.map((s) => [s.itemKey, s]));
  const matched = new Set<string>();
  let total = ZERO;
  const rows = [...args.items]
    .sort((a, b) => a.order - b.order)
    .map((it): RecurringRow => {
      const meta = metaBy.get(it.itemKey);
      const frequency = meta?.frequency || it.frequency;
      const amount = it.amount !== null ? new Decimal(it.amount) : null;
      const monthly = amount ? amount.times(perMonth(frequency)) : ZERO;
      total = total.plus(monthly);
      let snap: SnapshotItemData | undefined;
      if (meta && meta.snapshotMatch !== null) snap = meta.snapshotMatch ? snapBy.get(meta.snapshotMatch) : undefined;
      else {
        const cands = args.snapshot.filter((s) => normLabel(s.name) === normLabel(it.name));
        snap = cands.find((s) => normLabel(s.detail) === normLabel(it.detail)) ?? (cands.length === 1 ? cands[0] : undefined);
      }
      if (snap) matched.add(snap.itemKey);
      const snapMonthly = snap?.monthly !== null && snap?.monthly !== undefined ? new Decimal(snap.monthly) : null;
      const status: RecurringRow['status'] =
        it.listed.trim() === '?' ? 'Amount unknown' : it.listed.trim() === '' ? 'No amount listed' : amount && amount.isZero() ? '$0 / inactive' : 'Active';
      return {
        itemKey: it.itemKey,
        name: it.name,
        detail: it.detail,
        notes: it.notes,
        listed: it.listed,
        frequency,
        monthly: cents(monthly),
        department: meta?.department || guessDepartment(`${it.name} ${it.detail}`, args.departments),
        status,
        snapshot: snap ? { name: snap.detail ? `${snap.name} (${snap.detail})` : snap.name, monthly: snapMonthly ? cents(snapMonthly) : null, paymentMethod: snap.paymentMethod, chargeDate: snap.chargeDate } : null,
        changeVsSnapshot: snap && snapMonthly !== null ? cents(monthly.minus(snapMonthly)) : null,
        sourceCell: it.sourceCell,
      };
    });
  const missingFromCurrent = args.snapshot.filter((s) => !matched.has(s.itemKey)).sort((a, b) => a.order - b.order);
  return { rows, totalMonthly: cents(total), totalMonthlyDec: total, missingFromCurrent };
}

export interface DomainData {
  domain: string;
  price: string;
  renewal: string | null;
  note: string;
  sourceCell: string;
}

export function domainRows(domains: DomainData[], asOf: string, alertDays = 60) {
  return domains.map((d) => {
    const days = d.renewal ? daysBetween(asOf, d.renewal) : null;
    const cancelled = /cancel/i.test(d.note);
    const alert = !cancelled && days !== null && days <= alertDays;
    return { ...d, days, cancelled, alert, flag: cancelled ? 'Cancelled' : days === null ? 'No renewal date' : days < 0 ? 'Past renewal date' : alert ? `Renews in ${days} days` : '' };
  });
}
