import { Suspense } from 'react';
import Link from 'next/link';
import { requirePageUser } from '@/lib/server/auth';
import { lastImportInfo, loadAppSettings, financeSettings } from '@/lib/server/data';
import { hasRole } from '@/lib/security/roles';
import { Mark } from '@/components/Mark';
import { Nav, type NavItem } from '@/components/shell/Nav';
import { UserMenu } from '@/components/shell/UserMenu';
import { StatusChips } from '@/components/shell/StatusChips';

function fmtDate(ymd: string) {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function fmtWhen(d: Date | null) {
  if (!d) return 'never';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const [app, info] = await Promise.all([loadAppSettings(), lastImportInfo()]);
  const settings = financeSettings(app);
  const items: NavItem[] = [
    { href: '/', label: 'Dashboard', keepFilters: true },
    { href: '/transactions', label: 'Transactions', keepFilters: true },
    { href: '/projections', label: 'Projections' },
    { href: '/recurring', label: 'Recurring' },
    { href: '/quality', label: 'Data quality' },
    { href: '/reconciliation', label: 'Reconciliation' },
  ];
  if (hasRole(user.role, 'EDITOR')) items.push({ href: '/upload', label: 'Upload & sync' });
  if (hasRole(user.role, 'ADMIN')) items.push({ href: '/settings', label: 'Settings' }, { href: '/users', label: 'Users' });
  const st = info.lastSyncStatus ?? '';
  const sync = !info.lastSyncAt
    ? { text: 'not set up', tone: 'off' as const }
    : { text: `${fmtWhen(info.lastSyncAt)} · ${st || 'unknown'}`, tone: /^(committed|no changes)/i.test(st) ? ('ok' as const) : /held/i.test(st) ? ('warn' as const) : ('bad' as const) };
  const chips = <StatusChips asOf={fmtDate(settings.asOf)} asOfFixed={!!app.asOfDate} imported={fmtWhen(info.lastImportAt)} sync={sync} />;

  return (
    <>
      <meta name="csrf-token" content={user.csrfToken} />
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur-md supports-[backdrop-filter]:bg-paper/80">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <Mark size={28} />
            <span className="truncate text-[15px] font-semibold text-ink">
              {app.companyName} <span className="font-normal text-muted">Finance</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 lg:flex">{chips}</div>
            <UserMenu email={user.email} name={user.name} role={user.role} />
          </div>
        </div>
        <div className="mx-auto max-w-[1320px] px-4 sm:px-6">
          <Suspense>
            <Nav items={items} />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-[1320px] px-4 pt-6 pb-16 sm:px-6">
        <div className="mb-4 flex flex-wrap gap-2 lg:hidden">{chips}</div>
        {children}
      </main>
    </>
  );
}
