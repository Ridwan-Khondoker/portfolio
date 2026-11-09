'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export type NavItem = { href: string; label: string; keepFilters?: boolean };

export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const params = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of ['start', 'end', 'dept', 'cat', 'status']) {
    const v = params.get(k);
    if (v) keep.set(k, v);
  }
  const q = keep.toString();
  return (
    <nav aria-label="Main" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {items.map((it) => {
          const active = it.href === '/' ? path === '/' : path.startsWith(it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.keepFilters && q ? `${it.href}?${q}` : it.href}
                aria-current={active ? 'page' : undefined}
                className={`block rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${
                  active ? 'bg-amber-soft text-amber-ink ring-1 ring-amber-ring' : 'text-body hover:bg-line-soft hover:text-ink'
                }`}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
