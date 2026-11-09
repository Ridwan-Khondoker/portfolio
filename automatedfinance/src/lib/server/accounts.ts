// Account lifecycle: invites and resets (choose a password, done), sign-in, optional two-step verification,
// recovery codes. Whether 2FA is required is a Settings policy: nobody (default) / admins only / everyone.
import crypto from 'node:crypto';
import type { Role, AuthToken, TokenKind, User } from '@prisma/client';
import { prisma } from '@/lib/db';
import { decrypt, encrypt, randomToken, safeEqual, sha256 } from '@/lib/security/crypto';
import { burnPasswordCheck, hashPassword, passwordProblem, verifyPassword } from '@/lib/security/password';
import { generateTotpSecret, verifyTotp } from '@/lib/security/totp';
import { clearFailures, isLocked, recordFailure } from '@/lib/security/rate-limit';
import { createSession, revokeAllSessions, revokeSessionByToken, validateSessionToken } from '@/lib/security/session';
import { audit } from '@/lib/security/audit';

export const LINK_TTL_MS = 72 * 60 * 60 * 1000;
export const GENERIC_LOGIN_ERROR = 'Invalid email or password.';
export const GENERIC_CODE_ERROR = 'That code did not work. Check your authenticator app and try again.';
export const LOCKED_ERROR = 'Too many attempts. Wait 15 minutes and try again.';
export const INVALID_LINK = 'This link is invalid, expired or already used. Ask an admin for a new one.';

type Meta = { ip: string; userAgent: string };
export type SignInStep = 'done' | '2fa' | 'enroll';
type SessionGrant = { token: string; maxAgeSeconds: number; next: SignInStep };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

// ------------------------------------------------------------------ 2FA policy

export type TwoFactorPolicy = 'optional' | 'admins' | 'everyone';

export async function twoFactorPolicy(): Promise<TwoFactorPolicy> {
  const row = await prisma.setting.findUnique({ where: { key: 'twoFactorPolicy' } });
  const v = row?.value;
  return v === 'admins' || v === 'everyone' ? v : 'optional';
}

export function twoFactorRequired(role: Role, policy: TwoFactorPolicy): boolean {
  return policy === 'everyone' || (policy === 'admins' && role === 'ADMIN');
}

// ------------------------------------------------------------------ one-time links

export async function createLink(opts: {
  kind: TokenKind;
  email: string;
  role?: Role;
  userId?: string;
  createdById?: string | null;
}): Promise<string> {
  const token = randomToken(32);
  // A new link for the same email + kind replaces any older unused one.
  await prisma.authToken.updateMany({
    where: { email: opts.email, kind: opts.kind, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.authToken.create({
    data: {
      tokenHash: sha256(token),
      kind: opts.kind,
      email: opts.email,
      role: opts.role,
      userId: opts.userId,
      createdById: opts.createdById ?? null,
      expiresAt: new Date(Date.now() + LINK_TTL_MS),
    },
  });
  return token;
}

export async function findValidLink(token: string, kind: TokenKind): Promise<AuthToken | null> {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return null;
  const row = await prisma.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.kind !== kind || row.usedAt || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;
  if (kind === 'RESET' && row.userId) {
    const user = await prisma.user.findUnique({ where: { id: row.userId } });
    if (!user || !user.active) return null;
  }
  return row;
}

/**
 * Invite or reset link: choose a password and you're in (one step). Two-step verification is set up afterwards only
 * if Settings requires it for this person's role; otherwise it's optional on the Account page.
 */
export async function completeLinkWithPassword(
  row: AuthToken,
  password: string,
  confirm: string,
  meta: Meta,
): Promise<({ ok: true } & SessionGrant) | { ok: false; error: string; status: number }> {
  if (password !== confirm) return { ok: false, error: 'The two passwords do not match.', status: 400 };
  const problem = passwordProblem(password, row.email);
  if (problem) return { ok: false, error: problem, status: 400 };
  const passwordHash = await hashPassword(password);
  let user: User;
  try {
    user = await prisma.$transaction(async (tx) => {
      const claimed = await tx.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date(), pendingPasswordHash: null, pendingTotpEnc: null } });
      if (claimed.count !== 1) throw new Error(INVALID_LINK);
      if (row.kind === 'INVITE') {
        const existing = await tx.user.findUnique({ where: { email: row.email } });
        // A (re-)invite is a fresh start: new password, no 2FA until the person turns it on.
        const data = { passwordHash, active: true, role: row.role ?? 'VIEWER', totpEnabled: false, totpSecretEnc: null, totpPendingEnc: null, totpLastStep: null };
        if (existing) {
          await tx.recoveryCode.deleteMany({ where: { userId: existing.id } });
          return tx.user.update({ where: { id: existing.id }, data });
        }
        return tx.user.create({ data: { email: row.email, ...data } });
      }
      return tx.user.update({ where: { id: row.userId! }, data: { passwordHash } });
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message || INVALID_LINK, status: 410 };
  }
  // A new password ends every older session of this account.
  await revokeAllSessions(user.id, row.kind === 'INVITE' ? 'invite accepted' : 'password reset');
  await audit({ action: row.kind === 'INVITE' ? 'invite.accepted' : 'reset.completed', userId: user.id, email: user.email, ip: meta.ip, userAgent: meta.userAgent });
  return { ok: true, ...(await sessionAfterPassword(user, meta)) };
}

// ------------------------------------------------------------------ sign-in

/** After a correct password: straight in, or on to the 2FA code (if the person uses 2FA), or to 2FA set-up (if required). */
async function sessionAfterPassword(user: User, meta: Meta): Promise<SessionGrant> {
  if (user.totpEnabled) {
    const s = await createSession({ userId: user.id, mfaVerified: false, ip: meta.ip, userAgent: meta.userAgent });
    await audit({ action: 'login.password_ok', email: user.email, userId: user.id, ip: meta.ip, userAgent: meta.userAgent });
    return { ...s, next: '2fa' };
  }
  if (twoFactorRequired(user.role, await twoFactorPolicy())) {
    const s = await createSession({ userId: user.id, mfaVerified: false, ip: meta.ip, userAgent: meta.userAgent });
    await audit({ action: 'login.password_ok', email: user.email, userId: user.id, ip: meta.ip, userAgent: meta.userAgent, details: { mustEnroll2fa: true } });
    return { ...s, next: 'enroll' };
  }
  const s = await createSession({ userId: user.id, mfaVerified: true, ip: meta.ip, userAgent: meta.userAgent });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ action: 'login.success', email: user.email, userId: user.id, ip: meta.ip, userAgent: meta.userAgent, details: { twoFactor: false } });
  return { ...s, next: 'done' };
}

export async function passwordSignIn(
  emailRaw: string,
  password: string,
  meta: Meta,
): Promise<({ ok: true } & SessionGrant) | { ok: false; error: string; status: number }> {
  const email = normalizeEmail(emailRaw);
  const keys = [`login:ip:${meta.ip}`, `login:acct:${email}`];
  if (await isLocked(keys)) {
    await audit({ action: 'login.locked', email, ip: meta.ip, userAgent: meta.userAgent });
    return { ok: false, error: LOCKED_ERROR, status: 429 };
  }
  const user = isEmail(email) ? await prisma.user.findUnique({ where: { email } }) : null;
  let valid = false;
  if (user?.passwordHash && user.active) valid = await verifyPassword(user.passwordHash, password);
  else await burnPasswordCheck(password);

  if (!valid || !user) {
    await recordFailure(keys);
    await audit({ action: 'login.failed', email, userId: user?.id, ip: meta.ip, userAgent: meta.userAgent, details: { step: 'password' } });
    return { ok: false, error: GENERIC_LOGIN_ERROR, status: 401 };
  }
  await clearFailures([`login:acct:${email}`]);
  return { ok: true, ...(await sessionAfterPassword(user, meta)) };
}

/** Second factor: a current TOTP code or one unused recovery code. Issues a fresh session token (no fixation). */
export async function secondFactor(
  pendingToken: string | undefined,
  codeRaw: string,
  meta: Meta,
): Promise<{ ok: true; token: string; maxAgeSeconds: number } | { ok: false; error: string; status: number }> {
  const pending = await validateSessionToken(pendingToken);
  if (!pending || pending.mfaVerified) return { ok: false, error: 'Your sign-in expired. Start again.', status: 401 };
  const keys = [`mfa:ip:${meta.ip}`, `mfa:acct:${pending.email}`];
  if (await isLocked(keys)) {
    await audit({ action: 'login.locked', email: pending.email, userId: pending.userId, ip: meta.ip, details: { step: '2fa' } });
    return { ok: false, error: LOCKED_ERROR, status: 429 };
  }
  const user = await prisma.user.findUnique({ where: { id: pending.userId } });
  const code = codeRaw.trim();
  let ok = false;
  let usedRecovery = false;
  if (user?.totpEnabled && user.totpSecretEnc && user.active) {
    if (/^\d{6}$/.test(code.replace(/\s+/g, ''))) {
      const step = verifyTotp(decrypt(user.totpSecretEnc), code);
      if (step !== null && (user.totpLastStep === null || step > user.totpLastStep)) {
        ok = true;
        await prisma.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
      }
    } else {
      const hash = sha256(normalizeRecovery(code));
      // Compare against every unused code (constant-time per comparison).
      const all = await prisma.recoveryCode.findMany({ where: { userId: user.id, usedAt: null } });
      const match = all.find((r) => safeEqual(r.codeHash, hash));
      if (match) {
        const claimed = await prisma.recoveryCode.updateMany({ where: { id: match.id, usedAt: null }, data: { usedAt: new Date() } });
        ok = claimed.count === 1;
        usedRecovery = ok;
      }
    }
  }
  if (!ok || !user) {
    await recordFailure(keys);
    await audit({ action: 'login.failed', email: pending.email, userId: pending.userId, ip: meta.ip, userAgent: meta.userAgent, details: { step: '2fa' } });
    return { ok: false, error: GENERIC_CODE_ERROR, status: 401 };
  }
  await clearFailures([...keys, `login:ip:${meta.ip}`]);
  await revokeSessionByToken(pendingToken!, 'upgraded after 2FA');
  const { token, maxAgeSeconds } = await createSession({ userId: user.id, mfaVerified: true, ip: meta.ip, userAgent: meta.userAgent });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ action: 'login.success', email: user.email, userId: user.id, ip: meta.ip, userAgent: meta.userAgent, details: { twoFactor: true, recoveryCodeUsed: usedRecovery } });
  return { ok: true, token, maxAgeSeconds };
}

// ------------------------------------------------------------------ setting up 2FA (optional, or required by policy)

function makeRecoveryCodes(): string[] {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 8 }, () => {
    const bytes = crypto.randomBytes(10);
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

export function normalizeRecovery(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The secret to show as a QR code while someone sets up 2FA (created once, kept until confirmed). */
export async function enrollmentSecret(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.totpPendingEnc) return decrypt(user.totpPendingEnc);
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: userId }, data: { totpPendingEnc: encrypt(secret) } });
  return secret;
}

/** Confirms the first code from the authenticator app; turns 2FA on and returns 8 one-time recovery codes. */
export async function confirmEnrollment(userId: string, code: string, meta: Meta): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  const keys = [`enroll:acct:${userId}`, `enroll:ip:${meta.ip}`];
  if (await isLocked(keys)) return { ok: false, error: LOCKED_ERROR };
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.totpEnabled) return { ok: false, error: 'Two-step verification is already on.' };
  if (!user.totpPendingEnc) return { ok: false, error: 'Start the set-up again.' };
  const secret = decrypt(user.totpPendingEnc);
  const step = verifyTotp(secret, code);
  if (step === null) {
    await recordFailure(keys);
    return { ok: false, error: GENERIC_CODE_ERROR };
  }
  await clearFailures(keys);
  const recoveryCodes = makeRecoveryCodes();
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { totpSecretEnc: encrypt(secret), totpEnabled: true, totpLastStep: step, totpPendingEnc: null } }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({ data: recoveryCodes.map((c) => ({ userId, codeHash: sha256(normalizeRecovery(c)) })) }),
  ]);
  await audit({ action: 'account.2fa_enabled', userId, email: user.email, ip: meta.ip, userAgent: meta.userAgent });
  return { ok: true, recoveryCodes };
}

/** When Settings requires 2FA and the person hasn't set it up: finish set-up at sign-in, then they're in. */
export async function enrollAtSignIn(
  pendingToken: string | undefined,
  code: string,
  meta: Meta,
): Promise<{ ok: true; token: string; maxAgeSeconds: number; recoveryCodes: string[] } | { ok: false; error: string; status: number }> {
  const pending = await validateSessionToken(pendingToken);
  if (!pending || pending.mfaVerified) return { ok: false, error: 'Your sign-in expired. Start again.', status: 401 };
  const r = await confirmEnrollment(pending.userId, code, meta);
  if (!r.ok) return { ok: false, error: r.error, status: r.error === LOCKED_ERROR ? 429 : 400 };
  await revokeSessionByToken(pendingToken!, 'upgraded after 2FA set-up');
  const s = await createSession({ userId: pending.userId, mfaVerified: true, ip: meta.ip, userAgent: meta.userAgent });
  await prisma.user.update({ where: { id: pending.userId }, data: { lastLoginAt: new Date() } });
  await audit({ action: 'login.success', email: pending.email, userId: pending.userId, ip: meta.ip, userAgent: meta.userAgent, details: { twoFactor: true, enrolled: true } });
  return { ok: true, token: s.token, maxAgeSeconds: s.maxAgeSeconds, recoveryCodes: r.recoveryCodes };
}

/** Turn 2FA off from the Account page (needs a current code), unless Settings requires it for this role. */
export async function disableTwoFactor(userId: string, code: string, meta: Meta): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpEnabled || !user.totpSecretEnc) return { ok: false, error: 'Two-step verification is already off.' };
  if (twoFactorRequired(user.role, await twoFactorPolicy())) return { ok: false, error: 'Your organisation requires two-step verification for your role.' };
  const keys = [`mfa:acct:${user.email}`];
  if (await isLocked(keys)) return { ok: false, error: LOCKED_ERROR };
  const step = verifyTotp(decrypt(user.totpSecretEnc), code);
  if (step === null || (user.totpLastStep !== null && step <= user.totpLastStep)) {
    await recordFailure(keys);
    return { ok: false, error: GENERIC_CODE_ERROR };
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { totpEnabled: false, totpSecretEnc: null, totpPendingEnc: null, totpLastStep: null } }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
  ]);
  await audit({ action: 'account.2fa_disabled', userId, email: user.email, ip: meta.ip, userAgent: meta.userAgent });
  return { ok: true };
}

// ------------------------------------------------------------------ admin operations

/** One-time link to choose a new password. The person's 2FA (if any) stays as it is. */
export async function adminResetPassword(userId: string, adminId: string, meta: Meta): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const token = await createLink({ kind: 'RESET', email: user.email, userId, createdById: adminId });
  await audit({ action: 'user.password_reset_link', userId: adminId, target: user.email, ip: meta.ip, userAgent: meta.userAgent });
  return token;
}

/** For someone who lost their phone: turns their 2FA off and signs them out everywhere. */
export async function adminDisableTwoFactor(userId: string, adminId: string, meta: Meta): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { totpEnabled: false, totpSecretEnc: null, totpPendingEnc: null, totpLastStep: null } }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
  ]);
  await revokeAllSessions(userId, '2FA reset by admin');
  await audit({ action: 'user.2fa_reset', userId: adminId, target: user.email, ip: meta.ip, userAgent: meta.userAgent });
}
