import { prisma } from '@/lib/db';
import { requirePageUser } from '@/lib/server/auth';
import { sp, type SearchParams } from '@/lib/server/filters';
import { mailConfigured } from '@/lib/server/mail';
import { ROLE_LABEL } from '@/lib/security/roles';
import { IDLE_TIMEOUT_MS } from '@/lib/security/session';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { inputClass } from '@/components/ui/Field';
import { buttonClass } from '@/components/ui/Button';
import { ActionForm, Submit } from '@/components/ui/ActionForm';
import { LinkResultForm } from '@/components/LinkResultForm';
import { changeRoleAction, inviteAction, resetAccessAction, revokeInviteAction, revokeSessionAction, setActiveAction } from './actions';

export const metadata = { title: 'Users' };

const when = (d: Date | null) => (d ? d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }) : '–');

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await requirePageUser('ADMIN');
  const params = await searchParams;
  const auditPage = Math.max(1, Number(sp(params, 'auditPage')) || 1);
  const auditAction = sp(params, 'action') ?? '';
  const now = new Date();
  const [users, invites, sessions, auditRows, auditCount, actions] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ active: 'desc' }, { email: 'asc' }] }),
    prisma.authToken.findMany({ where: { usedAt: null, revokedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: 'desc' } }),
    prisma.session.findMany({ where: { revokedAt: null, expiresAt: { gt: now }, mfaVerified: true, lastSeenAt: { gt: new Date(now.getTime() - IDLE_TIMEOUT_MS) } }, include: { user: { select: { email: true } } }, orderBy: { lastSeenAt: 'desc' } }),
    prisma.auditLog.findMany({ where: auditAction ? { action: { startsWith: auditAction } } : {}, orderBy: { at: 'desc' }, take: 100, skip: (auditPage - 1) * 100 }),
    prisma.auditLog.count({ where: auditAction ? { action: { startsWith: auditAction } } : {} }),
    prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
  ]);
  const emailById = new Map(users.map((u) => [u.id, u.email]));
  const sessionsBy = new Map<string, typeof sessions>();
  for (const s of sessions) sessionsBy.set(s.userId, [...(sessionsBy.get(s.userId) ?? []), s]);
  const mail = mailConfigured();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="mt-1 text-sm text-body">Only invited people can open anything in this app. Every account uses a password and two-step verification.</p>

      <SectionTitle sub="One-time link, valid 72 hours. The person sets a password and turns on 2FA.">Invite someone</SectionTitle>
      <Card>
        <LinkResultForm action={inviteAction} className="grid gap-2 sm:grid-cols-[2fr_1fr_auto_auto] sm:items-center">
          <input name="email" type="email" required placeholder="name@company.com" aria-label="Email address" className={inputClass} />
          <select name="role" defaultValue="VIEWER" aria-label="Role" className={inputClass}>
            <option value="VIEWER">Viewer: read-only dashboard and reports</option>
            <option value="EDITOR">Editor: uploads, manual entries, statuses, syncs</option>
            <option value="ADMIN">Admin: everything, incl. users and settings</option>
          </select>
          {mail && (
            <label className="flex items-center gap-1.5 text-[13px]">
              <input type="checkbox" name="send" defaultChecked /> Email it
            </label>
          )}
          <Submit variant="brand">Create invite</Submit>
        </LinkResultForm>
      </Card>

      <SectionTitle sub={`${users.length} accounts`}>People</SectionTitle>
      <div className="space-y-2">
        {users.map((u) => {
          const us = sessionsBy.get(u.id) ?? [];
          return (
            <Card key={u.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">
                    {u.email} {u.id === me.userId && <span className="text-muted">(you)</span>}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-1.5 text-[12px]">
                    <Badge tone={u.role === 'ADMIN' ? 'purple' : u.role === 'EDITOR' ? 'blue' : 'neutral'}>{ROLE_LABEL[u.role]}</Badge>
                    {u.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}
                    {u.totpEnabled ? <Badge tone="green">2FA on</Badge> : <Badge tone="amber">2FA not set up</Badge>}
                    <span className="text-muted">Last sign-in {when(u.lastLoginAt)}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ActionForm action={changeRoleAction} className="flex items-center gap-1.5">
                    <input type="hidden" name="userId" value={u.id} />
                    <select name="role" defaultValue={u.role} aria-label={`Role for ${u.email}`} className="rounded-md border border-line px-2 py-1.5 text-[13px]">
                      <option value="VIEWER">Viewer</option>
                      <option value="EDITOR">Editor</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                    <Submit size="sm" variant="ghost">
                      Change role
                    </Submit>
                  </ActionForm>
                  {u.id !== me.userId && (
                    <ActionForm action={setActiveAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="active" value={u.active ? '0' : '1'} />
                      <Submit size="sm" variant={u.active ? 'danger' : 'ghost'} confirm={u.active ? `Deactivate ${u.email}? They are signed out immediately.` : undefined}>
                        {u.active ? 'Deactivate' : 'Reactivate'}
                      </Submit>
                    </ActionForm>
                  )}
                </div>
              </div>
              {u.id !== me.userId && u.active && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[12.5px] text-amber-strong">Reset password &amp; 2FA</summary>
                  <LinkResultForm action={resetAccessAction} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    {mail && (
                      <label className="flex items-center gap-1.5 text-[13px]">
                        <input type="checkbox" name="send" defaultChecked /> Email the link
                      </label>
                    )}
                    <Submit size="sm" variant="danger" confirm={`Reset ${u.email}'s password and 2FA? Their sessions end and they need the new link to sign in.`}>
                      Reset and create link
                    </Submit>
                  </LinkResultForm>
                </details>
              )}
              {us.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[12.5px] text-body">{us.length} active session(s)</summary>
                  <ul className="mt-1 divide-y divide-line-soft text-[12.5px]">
                    {us.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                        <span className="text-muted">
                          Since {when(s.createdAt)} · last seen {when(s.lastSeenAt)} · {s.ip} · {s.userAgent?.slice(0, 60)}
                        </span>
                        <ActionForm action={revokeSessionAction}>
                          <input type="hidden" name="sessionId" value={s.id} />
                          <Submit size="sm" variant="link">
                            End session
                          </Submit>
                        </ActionForm>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          );
        })}
      </div>

      {invites.length > 0 && (
        <>
          <SectionTitle>Open invite and reset links</SectionTitle>
          <Card>
            <ul className="divide-y divide-line-soft text-[13px]">
              {invites.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>
                    {t.kind === 'INVITE' ? 'Invite' : 'Reset'} · <strong className="text-ink">{t.email}</strong>
                    {t.role ? ` · ${ROLE_LABEL[t.role]}` : ''} · expires {when(t.expiresAt)}
                    {t.pendingPasswordHash ? ' · password chosen, 2FA pending' : ''}
                  </span>
                  <ActionForm action={revokeInviteAction}>
                    <input type="hidden" name="tokenId" value={t.id} />
                    <Submit size="sm" variant="link">
                      Cancel link
                    </Submit>
                  </ActionForm>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <SectionTitle sub={`${auditCount.toLocaleString()} entries`}>Audit log</SectionTitle>
      <Card>
        <form method="get" className="mb-3 flex flex-wrap items-center gap-2">
          <select name="action" defaultValue={auditAction} aria-label="Filter by action" className={`${inputClass} w-auto`}>
            <option value="">All actions</option>
            {[...new Set(actions.map((a) => a.action.split('.')[0]!))].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button className={buttonClass('ghost', 'sm')} type="submit">
            Filter
          </button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[12px]">
            <thead className="text-left text-body">
              <tr className="border-b border-line">
                <th className="py-1.5 pr-2 font-semibold">When (ET)</th>
                <th className="py-1.5 pr-2 font-semibold">Action</th>
                <th className="py-1.5 pr-2 font-semibold">User</th>
                <th className="py-1.5 pr-2 font-semibold">Target</th>
                <th className="py-1.5 pr-2 font-semibold">IP</th>
                <th className="py-1.5 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((a) => (
                <tr key={String(a.id)} className="border-b border-line-soft align-top">
                  <td className="py-1 pr-2 whitespace-nowrap">{when(a.at)}</td>
                  <td className="py-1 pr-2">
                    <Badge tone={a.action.includes('failed') || a.action.includes('locked') ? 'red' : a.action.startsWith('login') ? 'green' : 'neutral'}>{a.action}</Badge>
                  </td>
                  <td className="py-1 pr-2">{(a.userId && emailById.get(a.userId)) || a.email || 'system'}</td>
                  <td className="py-1 pr-2">{a.target}</td>
                  <td className="py-1 pr-2 font-mono">{a.ip}</td>
                  <td className="max-w-[360px] truncate py-1 font-mono text-[11px] text-muted" title={a.details ? JSON.stringify(a.details) : ''}>
                    {a.details ? JSON.stringify(a.details) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex gap-2 text-[13px]">
          {auditPage > 1 && (
            <a className={buttonClass('ghost', 'sm')} href={`/users?auditPage=${auditPage - 1}${auditAction ? `&action=${auditAction}` : ''}`}>
              Newer
            </a>
          )}
          {auditPage * 100 < auditCount && (
            <a className={buttonClass('ghost', 'sm')} href={`/users?auditPage=${auditPage + 1}${auditAction ? `&action=${auditAction}` : ''}`}>
              Older
            </a>
          )}
        </div>
      </Card>
    </div>
  );
}
