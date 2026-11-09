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
      <header className="sticky top-0 z-20 shadow-[0_1px_0_rgba(20,17,14,0.08)]">
        {/* Happy To Deliver yellow brand bar */}
        <div className="bg-amber">
          <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
            <Link href="/" className="flex min-w-0 items-center gap-2.5">
              <Mark size={32} inverted />
              <div className="min-w-0">
                <p className="truncate text-[16px] leading-tight font-bold text-amber-ink">{app.companyName} · Finance</p>
                <p className="truncate text-xs text-amber-ink/75">
                  As of <span className="tabular font-semibold text-amber-ink">{fmtDate(settings.asOf)}</span>
                  {app.asOfDate ? ' (fixed in Settings)' : ''}
                  {' · '}
                  <span className="whitespace-nowrap">
                    Imported <span className="font-medium text-amber-ink">{fmtWhen(info.lastImportAt)}</span>
                  </span>
                  <span className="hidden md:inline">
                    {' · '}Google sync{' '}
                    <span className={syncBad ? 'rounded bg-danger px-1 font-semibold text-white' : 'font-medium text-amber-ink'}>
                      {info.lastSyncAt ? `${fmtWhen(info.lastSyncAt)} (${info.lastSyncStatus ?? 'unknown'})` : 'not set up'}
                    </span>
                  </span>
                </p>
              </div>
            </Link>
            <UserMenu email={user.email} name={user.name} role={user.role} />
          </div>
        </div>
        <div className="border-b border-line bg-paper">
          <div className="mx-auto max-w-[1320px] px-4 py-2 sm:px-6">
            <Suspense>
              <Nav items={items} />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1320px] px-4 pt-5 pb-16 sm:px-6">{children}</main>
    </>
  );
}
