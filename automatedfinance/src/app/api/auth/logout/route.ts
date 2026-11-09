import { cookies } from 'next/headers';
import { json, metaOf } from '@/lib/server/auth-routes';
import { revokeSessionByToken, sessionCookieName, sessionCookieOptions, validateSessionToken } from '@/lib/security/session';
import { audit } from '@/lib/security/audit';

export async function POST(req: Request) {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) {
    const s = await validateSessionToken(token);
    await revokeSessionByToken(token, 'signed out');
    if (s) await audit({ action: 'logout', userId: s.userId, email: s.email, ...metaOf(req) });
  }
  const res = json({ ok: true });
  res.cookies.set(sessionCookieName(), '', sessionCookieOptions(0));
  return res;
}
