import { prisma } from '@/lib/db';
import { requirePageUser } from '@/lib/server/auth';
import { ROLE_LABEL } from '@/lib/security/roles';
import { IDLE_TIMEOUT_MS } from '@/lib/security/session';
import { enrollmentSecret, twoFactorPolicy, twoFactorRequired } from '@/lib/server/accounts';
import { totpQrSvg } from '@/lib/server/totp-qr';
import { Card, SectionTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { inputClass } from '@/components/ui/Field';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { ActionForm, Submit } from '@/components/ui/ActionForm';
import { TotpEnroll } from '@/components/auth/TotpEnroll';
import { changePasswordAction, disableTwoFactorAction, enableTwoFactorAction, endMySessionAction, newRecoveryCodesAction } from './actions';

export const metadata = { title: 'Account' };
const when = (d: Date) => d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }) + ' ET';

export default async function AccountPage() {
  const me = await requirePageUser();
  const now = new Date();
  const [user, sessions, codesLeft, policy] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: me.userId } }),
    prisma.session.findMany({ where: { userId: me.userId, revokedAt: null, mfaVerified: true, expiresAt: { gt: now }, lastSeenAt: { gt: new Date(now.getTime() - IDLE_TIMEOUT_MS) } }, orderBy: { lastSeenAt: 'desc' } }),
    prisma.recoveryCode.count({ where: { userId: me.userId, usedAt: null } }),
    twoFactorPolicy(),
  ]);
  const required = twoFactorRequired(me.role, policy);
  const secret = user.totpEnabled ? null : await enrollmentSecret(me.userId);

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
          <PasswordInput id="pw-current" name="current" label="Current password" autoComplete="current-password" required />
          <PasswordInput id="pw-new" name="password" label="New password" autoComplete="new-password" minLength={12} required hint="12+ characters" />
          <PasswordInput id="pw-confirm" name="confirm" label="Repeat new password" autoComplete="new-password" minLength={12} required />
          <div className="sm:col-span-3">
            <Submit>Change password</Submit>
          </div>
        </ActionForm>
      </Card>

      <SectionTitle sub={required ? 'Required for your role' : 'Optional, recommended'}>Two-step verification</SectionTitle>
      <Card>
        {user.totpEnabled ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm">
              <Badge tone="green">On</Badge> Sign-in asks for a code from your authenticator app. {codesLeft} of 8 recovery codes unused.
            </p>
            <ActionForm action={newRecoveryCodesAction} className="flex flex-wrap items-center gap-2">
              <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="Current 6-digit code" aria-label="Current authenticator code" maxLength={7} className={`${inputClass} w-48`} required />
              <Submit variant="ghost">Make new recovery codes</Submit>
            </ActionForm>
            {!required && (
              <details>
                <summary className="cursor-pointer text-[13px] text-amber-strong">Turn off two-step verification</summary>
                <ActionForm action={disableTwoFactorAction} className="mt-2 flex flex-wrap items-center gap-2">
                  <input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="Current 6-digit code" aria-label="Current authenticator code" maxLength={7} className={`${inputClass} w-48`} required />
                  <Submit variant="danger" confirm="Turn off two-step verification? Sign-in will only need your password.">
                    Turn off
                  </Submit>
                </ActionForm>
              </details>
            )}
          </div>
        ) : (
          <details open={required}>
            <summary className="cursor-pointer text-sm">
              <Badge tone="neutral">Off</Badge> <span className="ml-1 text-amber-strong">Turn on two-step verification</span>
            </summary>
            <div className="mt-3 max-w-sm">
              <TotpEnroll qrSvg={await totpQrSvg(secret!, me.email)} secret={secret!} action={enableTwoFactorAction} doneHref="/account" intro="Adds a 6-digit code from your phone at sign-in, so a stolen password alone can't open the finance data." />
            </div>
          </details>
        )}
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
