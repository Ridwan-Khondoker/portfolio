'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export type NavItem = { href: string; label: string; keepFilters?: boolean };

/** Tab navigation; the current page has a brand-yellow underline. */
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
    <nav aria-label="Main" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {items.map((it) => {
          const active = it.href === '/' ? path === '/' : path.startsWith(it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.keepFilters && q ? `${it.href}?${q}` : it.href}
                aria-current={active ? 'page' : undefined}
                className={`relative block px-3 py-3 text-[13.5px] font-medium transition-colors ${active ? 'text-ink' : 'text-muted hover:text-ink'}`}
              >
                {it.label}
                <span aria-hidden className={`absolute inset-x-2 -bottom-px h-[3px] rounded-full ${active ? 'bg-brand' : 'bg-transparent'}`} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
