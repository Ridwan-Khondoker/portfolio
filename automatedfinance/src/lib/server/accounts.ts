// Account lifecycle: invites, password + 2FA enrollment, sign-in, recovery codes, resets.
import crypto from 'node:crypto';
import type { Role, AuthToken, TokenKind } from '@prisma/client';
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

type Meta = { ip: string; userAgent: string };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
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

/** Step 1 of an invite/reset: choose a password. Generates the 2FA secret to enroll in step 2. */
export async function setLinkPassword(row: AuthToken, password: string): Promise<string | null> {
  const problem = passwordProblem(password, row.email);
  if (problem) return problem;
  await prisma.authToken.update({
    where: { id: row.id },
    data: { pendingPasswordHash: await hashPassword(password), pendingTotpEnc: encrypt(generateTotpSecret()) },
  });
  return null;
}

export function pendingTotpSecret(row: AuthToken): string | null {
  return row.pendingTotpEnc ? decrypt(row.pendingTotpEnc) : null;
}

/** Step 2: confirm the authenticator code. Activates the account and returns 8 one-time recovery codes. */
export async function completeLink(
  row: AuthToken,
  code: string,
  meta: Meta,
): Promise<{ ok: true; userId: string; recoveryCodes: string[] } | { ok: false; error: string }> {
  const keys = [`enroll:link:${row.id}`, `enroll:ip:${meta.ip}`];
  if (await isLocked(keys)) return { ok: false, error: LOCKED_ERROR };
  const secret = pendingTotpSecret(row);
  if (!secret || !row.pendingPasswordHash) return { ok: false, error: 'Choose a password first.' };
  const step = verifyTotp(secret, code);
  if (step === null) {
    await recordFailure(keys);
    return { ok: false, error: GENERIC_CODE_ERROR };
  }
  await clearFailures(keys);

  const recoveryCodes = makeRecoveryCodes();
  const userId = await prisma.$transaction(async (tx) => {
    const claimed = await tx.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new Error('This link has already been used.');
    let user;
    if (row.kind === 'INVITE') {
      const existing = await tx.user.findUnique({ where: { email: row.email } });
      const data = {
        passwordHash: row.pendingPasswordHash!,
        totpSecretEnc: encrypt(secret),
        totpEnabled: true,
        totpLastStep: step,
        active: true,
        role: row.role ?? 'VIEWER',
      };
      user = existing
        ? await tx.user.update({ where: { id: existing.id }, data })
        : await tx.user.create({ data: { email: row.email, ...data } });
    } else {
      user = await tx.user.update({
        where: { id: row.userId! },
        data: { passwordHash: row.pendingPasswordHash!, totpSecretEnc: encrypt(secret), totpEnabled: true, totpLastStep: step },
      });
    }
    await tx.recoveryCode.deleteMany({ where: { userId: user.id } });
    await tx.recoveryCode.createMany({ data: recoveryCodes.map((c) => ({ userId: user.id, codeHash: sha256(normalizeRecovery(c)) })) });
    return user.id;
  });
  await audit({
    action: row.kind === 'INVITE' ? 'invite.accepted' : 'reset.completed',
    userId,
    email: row.email,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return { ok: true, userId, recoveryCodes };
}

function makeRecoveryCodes(): string[] {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 8 }, () => {
    const bytes = crypto.randomBytes(10);
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

function normalizeRecovery(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ------------------------------------------------------------------ sign-in

export async function passwordSignIn(
  emailRaw: string,
  password: string,
  meta: Meta,
): Promise<{ ok: true; token: string; maxAgeSeconds: number } | { ok: false; error: string; status: number }> {
  const email = normalizeEmail(emailRaw);
  const keys = [`login:ip:${meta.ip}`, `login:acct:${email}`];
  if (await isLocked(keys)) {
    await audit({ action: 'login.locked', email, ip: meta.ip, userAgent: meta.userAgent });
    return { ok: false, error: LOCKED_ERROR, status: 429 };
  }
  const user = isEmail(email) ? await prisma.user.findUnique({ where: { email } }) : null;
  let valid = false;
  if (user?.passwordHash && user.active && user.totpEnabled) valid = await verifyPassword(user.passwordHash, password);
  else await burnPasswordCheck(password);

  if (!valid || !user) {
    await recordFailure(keys);
    await audit({ action: 'login.failed', email, userId: user?.id, ip: meta.ip, userAgent: meta.userAgent, details: { step: 'password' } });
    return { ok: false, error: GENERIC_LOGIN_ERROR, status: 401 };
  }
  await clearFailures([`login:acct:${email}`]);
  const { token, maxAgeSeconds } = await createSession({ userId: user.id, mfaVerified: false, ip: meta.ip, userAgent: meta.userAgent });
  await audit({ action: 'login.password_ok', email, userId: user.id, ip: meta.ip, userAgent: meta.userAgent });
  return { ok: true, token, maxAgeSeconds };
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
  await audit({ action: 'login.success', email: user.email, userId: user.id, ip: meta.ip, userAgent: meta.userAgent, details: { recoveryCodeUsed: usedRecovery } });
  return { ok: true, token, maxAgeSeconds };
}

// ------------------------------------------------------------------ admin operations

export async function adminResetAccess(userId: string, adminId: string, meta: Meta): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { totpEnabled: false, totpSecretEnc: null, totpLastStep: null } }),
    prisma.recoveryCode.deleteMany({ where: { userId } }),
  ]);
  await revokeAllSessions(userId, 'password and 2FA reset by admin');
  const token = await createLink({ kind: 'RESET', email: user.email, userId, createdById: adminId });
  await audit({ action: 'user.2fa_reset', userId: adminId, target: user.email, ip: meta.ip, userAgent: meta.userAgent });
  return token;
}
