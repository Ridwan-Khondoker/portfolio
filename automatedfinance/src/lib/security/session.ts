import { prisma } from '@/lib/db';
import { secureCookies } from '@/lib/env';
import { randomToken, sha256 } from './crypto';
import type { Role } from '@prisma/client';

export const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours
export const ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const PENDING_MFA_TIMEOUT_MS = 10 * 60 * 1000; // password accepted, waiting for the 2FA code
const TOUCH_EVERY_MS = 60 * 1000;

export function sessionCookieName(): string {
  return secureCookies() ? '__Host-af_session' : 'af_session';
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export type SessionUser = {
  sessionId: string;
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  mfaVerified: boolean;
  csrfToken: string;
};

export async function createSession(opts: {
  userId: string;
  mfaVerified: boolean;
  ip: string;
  userAgent: string;
}): Promise<{ token: string; maxAgeSeconds: number }> {
  const token = randomToken(32);
  const now = Date.now();
  const ttl = opts.mfaVerified ? ABSOLUTE_TIMEOUT_MS : PENDING_MFA_TIMEOUT_MS;
  await prisma.session.create({
    data: {
      tokenHash: sha256(token),
      userId: opts.userId,
      mfaVerified: opts.mfaVerified,
      csrfToken: randomToken(24),
      expiresAt: new Date(now + ttl),
      ip: opts.ip,
      userAgent: opts.userAgent,
    },
  });
  return { token, maxAgeSeconds: Math.floor(ttl / 1000) };
}

/**
 * Validates a session token: not revoked, inside the absolute and idle windows, user active.
 * `touch` refreshes lastSeenAt (the proxy does this once per request).
 */
export async function validateSessionToken(token: string | undefined | null, touch = false): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) return null;
  if (session.mfaVerified && now - session.lastSeenAt.getTime() > IDLE_TIMEOUT_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date(), revokeReason: 'idle timeout' } });
    return null;
  }
  if (!session.user.active) return null;
  if (touch && now - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return {
    sessionId: session.id,
    userId: session.userId,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    mfaVerified: session.mfaVerified,
    csrfToken: session.csrfToken,
  };
}

export async function revokeSession(sessionId: string, reason: string) {
  await prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } });
}

export async function revokeAllSessions(userId: string, reason: string) {
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } });
}

export async function revokeSessionByToken(token: string, reason: string) {
  await prisma.session.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } });
}
