import Link from 'next/link';
import { signOutAction } from '@/app/(app)/actions/session';
import { ROLE_LABEL } from '@/lib/security/roles';
import type { Role } from '@prisma/client';

export function UserMenu({ email, name, role }: { email: string; name: string | null; role: Role }) {
  const initials = (name || email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-line-soft [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">
          {initials}
        </span>
        <span className="hidden text-[13px] font-medium text-ink sm:inline">{name || email.split('@')[0]}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="hidden text-muted sm:block">
          <path d="M6 9l6 6 6-6" />
        </svg>
        <span className="sr-only">Account menu</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-line bg-paper p-2 shadow-[var(--shadow-pop)]">
        <div className="border-b border-line-soft px-2 pt-1 pb-2">
          <p className="truncate text-sm font-semibold text-ink">{email}</p>
          <p className="text-xs text-muted">{ROLE_LABEL[role]}</p>
        </div>
        <Link href="/account" className="mt-1 block rounded-lg px-2 py-2 text-sm hover:bg-line-soft">
          Account &amp; security
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="block w-full cursor-pointer rounded-lg px-2 py-2 text-left text-sm hover:bg-line-soft">
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
