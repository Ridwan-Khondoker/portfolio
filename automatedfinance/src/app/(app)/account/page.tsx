import { prisma } from '@/lib/db';
import { requirePageUser } from '@/lib/server/auth';
import { ROLE_LABEL } from '@/lib/security/roles';
import { IDLE_TIMEOUT_MS } from '@/lib/security/session';
import { Card, SectionTitle } from '@/components/ui/Card';
import { inputClass } from '@/components/ui/Field';
import { ActionForm, Submit } from '@/components/ui/ActionForm';
import { changePasswordAction, endMySessionAction, newRecoveryCodesAction } from './actions';

export const metadata = { title: 'Account' };
const when = (d: Date) => d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }) + ' ET';

export default async function AccountPage() {
  const me = await requirePageUser();
  const now = new Date();
  const [sessions, codesLeft] = await Promise.all([
    prisma.session.findMany({ where: { userId: me.userId, revokedAt: null, mfaVerified: true, expiresAt: { gt: now }, lastSeenAt: { gt: new Date(now.getTime() - IDLE_TIMEOUT_MS) } }, orderBy: { lastSeenAt: 'desc' } }),
    prisma.recoveryCode.count({ where: { userId: me.userId, usedAt: null } }),
  ]);
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Account &amp; security</h1>
      <p className="mt-1 text-sm text-body">
        {me.email} · {ROLE_LABEL[me.role]}
      </p>

      <SectionTitle>Password</SectionTitle>
      <Card>
        <ActionForm action={changePasswordAction} resetOnSuccess className="grid gap-3 sm:grid-cols-3">
          <input type="email" name="username" autoComplete="username" value={me.email} readOnly hidden />
          <input name="current" type="password" autoComplete="current-password" placeholder="Current password" aria-label="Current password" className={inputClass} required />
          <input name="password" type="password" autoComplete="new-password" placeholder="New password (12+ characters)" aria-label="New password" minLength={12} className={inputClass} required />
          <input name="confirm" type="password" autoComplete="new-password" placeholder="Repeat new password" aria-label="Repeat new password" minLength={12} className={inputClass} required />
          <div className="sm:col-span-3">
            <Submit>Change password</Submit>
          </div>
        </ActionForm>
      </Card>

      <SectionTitle sub={`${codesLeft} of 8 unused`}>Recovery codes</SectionTitle>
      <Card note="Lost your phone? An admin can reset your 2FA from the Users page.">
        <ActionForm action={newRecoveryCodesAction} className="flex flex-wrap items-center gap-2">
          <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="Current 6-digit code" aria-label="Current authenticator code" maxLength={7} className={`${inputClass} w-48`} required />
          <Submit variant="ghost">Make new recovery codes</Submit>
        </ActionForm>
      </Card>

      <SectionTitle sub="Sessions end after 12 hours idle or 7 days at most">Your sessions</SectionTitle>
      <Card>
        <ul className="divide-y divide-line-soft text-[13px]">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {s.id === me.sessionId ? <strong className="text-ink">This session</strong> : 'Session'} · since {when(s.createdAt)} · last seen {when(s.lastSeenAt)}
                <span className="block text-muted">
                  {s.ip} · {s.userAgent?.slice(0, 80)}
                </span>
              </span>
              {s.id !== me.sessionId && (
                <ActionForm action={endMySessionAction}>
                  <input type="hidden" name="sessionId" value={s.id} />
                  <Submit size="sm" variant="link">
                    Sign out
                  </Submit>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
