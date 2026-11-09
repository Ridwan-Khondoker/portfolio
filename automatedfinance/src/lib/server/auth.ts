import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Role } from '@prisma/client';
import { sessionCookieName, validateSessionToken, type SessionUser } from '@/lib/security/session';
import { hasRole } from '@/lib/security/roles';
import { clientIp, userAgent } from '@/lib/security/request';
import { safeEqual } from '@/lib/security/crypto';

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to do that.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/** Fully signed-in user (password + 2FA), or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const s = await validateSessionToken(jar.get(sessionCookieName())?.value);
  return s && s.mfaVerified ? s : null;
}

/** For pages: redirects to /login when signed out; to / with a notice when the role is too low. */
export async function requirePageUser(minRole: Role = 'VIEWER'): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (!hasRole(user.role, minRole)) redirect('/?denied=1');
  return user;
}

/** For server actions: throws instead of redirecting so the caller gets an error result. */
export async function requireActionUser(minRole: Role = 'VIEWER'): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new ForbiddenError('Your session has ended. Sign in again.');
  if (!hasRole(user.role, minRole)) throw new ForbiddenError();
  return user;
}

export async function requestMeta(): Promise<{ ip: string; userAgent: string }> {
  const h = await headers();
  return { ip: clientIp(h), userAgent: userAgent(h) };
}

/** For route handlers. Mutating requests must also carry the session's CSRF token. */
export async function apiUser(
  req: Request,
  minRole: Role = 'VIEWER',
): Promise<{ user: SessionUser } | { response: Response }> {
  const user = await currentUser();
  if (!user) return { response: Response.json({ error: 'Authentication required' }, { status: 401 }) };
  if (!hasRole(user.role, minRole)) return { response: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  if (!['GET', 'HEAD'].includes(req.method)) {
    const token = req.headers.get('x-csrf-token') || '';
    if (!token || !safeEqual(token, user.csrfToken)) return { response: Response.json({ error: 'Invalid CSRF token' }, { status: 403 }) };
  }
  return { user };
}
