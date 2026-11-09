import { Suspense } from 'react';
import Link from 'next/link';
import { requirePageUser } from '@/lib/server/auth';
import { lastImportInfo, loadAppSettings, financeSettings } from '@/lib/server/data';
import { hasRole } from '@/lib/security/roles';
import { Mark } from '@/components/Mark';
import { Nav, type NavItem } from '@/components/shell/Nav';
import { UserMenu } from '@/components/shell/UserMenu';

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
  const syncBad = info.lastSyncStatus && !/^(ok|committed|no changes)/i.test(info.lastSyncStatus);

  return (
    <>
      <meta name="csrf-token" content={user.csrfToken} />
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-3 px-4 pt-3 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <Mark size={30} />
            <div className="min-w-0">
              <p className="truncate font-display text-[17px] leading-tight font-semibold text-ink">{app.companyName} · Finance</p>
              <p className="truncate text-xs text-muted">
                As of <span className="tabular text-body">{fmtDate(settings.asOf)}</span>
                {app.asOfDate ? ' (fixed in Settings)' : ''}
                {' · '}
                <span className="whitespace-nowrap">
                  Imported <span className="text-body">{fmtWhen(info.lastImportAt)}</span>
                </span>
                <span className="hidden md:inline">
                  {' · '}Google sync{' '}
                  <span className={syncBad ? 'font-semibold text-danger' : 'text-body'}>
                    {info.lastSyncAt ? `${fmtWhen(info.lastSyncAt)} (${info.lastSyncStatus ?? 'unknown'})` : 'not set up'}
                  </span>
                </span>
              </p>
            </div>
          </Link>
          <UserMenu email={user.email} name={user.name} role={user.role} />
        </div>
        <div className="mx-auto max-w-[1320px] px-4 pt-2 pb-2 sm:px-6">
          <Suspense>
            <Nav items={items} />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-[1320px] px-4 pt-5 pb-16 sm:px-6">{children}</main>
    </>
  );
}
