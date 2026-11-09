'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revokeSessionByToken, sessionCookieName, sessionCookieOptions, validateSessionToken } from '@/lib/security/session';
import { audit } from '@/lib/security/audit';
import { requestMeta } from '@/lib/server/auth';

export async function signOutAction() {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) {
    const s = await validateSessionToken(token);
    await revokeSessionByToken(token, 'signed out');
    if (s) await audit({ action: 'logout', userId: s.userId, email: s.email, ...(await requestMeta()) });
  }
  jar.set(sessionCookieName(), '', sessionCookieOptions(0));
  redirect('/login');
}
