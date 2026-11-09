'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Select, inputClass, Label } from '@/components/ui/Field';

export function FilterBar({
  start,
  end,
  department,
  category,
  status,
  departments,
  categories,
  defaults,
  note,
}: {
  start: string;
  end: string;
  department: string;
  category: string;
  status: string;
  departments: string[];
  categories: string[];
  defaults: { start: string; end: string };
  note?: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function set(key: string, value: string) {
    const q = new URLSearchParams(params.toString());
    if (!value || value === 'All') q.delete(key);
    else q.set(key, value);
    q.delete('page');
    startTransition(() => router.replace(`${path}${q.toString() ? `?${q}` : ''}`, { scroll: false }));
  }

  return (
    <section aria-label="Filters" className="rounded-2xl border border-line bg-kraft/60 p-3 sm:p-4" aria-busy={pending}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(5,minmax(0,1fr))_auto] md:items-end">
        <div>
          <Label htmlFor="f-start">Start month</Label>
          <input id="f-start" type="month" className={inputClass} value={start} max={end} onChange={(e) => e.target.value && set('start', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="f-end">End month</Label>
          <input id="f-end" type="month" className={inputClass} value={end} min={start} onChange={(e) => e.target.value && set('end', e.target.value)} />
        </div>
        <Select id="f-dept" label="Business" value={department} onChange={(e) => set('dept', e.target.value)}>
          <option>All</option>
          {departments.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
        <Select id="f-cat" label="Category" value={category} onChange={(e) => set('cat', e.target.value)}>
          <option>All</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select id="f-status" label="Payment status" value={status} onChange={(e) => set('status', e.target.value)}>
          <option>All</option>
          <option>Paid</option>
          <option>Pending</option>
          <option>Overdue</option>
          <option>Not recorded</option>
        </Select>
        <button
          type="button"
          className="col-span-2 justify-self-start rounded-lg px-2 py-2 text-[13px] font-semibold text-amber-strong hover:underline md:col-span-1"
          onClick={() => startTransition(() => router.replace(path, { scroll: false }))}
        >
          Reset
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        {note}
        {pending ? ' · updating…' : ''}
        {start === defaults.start && end === defaults.end ? '' : ''}
      </p>
    </section>
  );
}
