import { cookies } from 'next/headers';
import { secondFactor } from '@/lib/server/accounts';
import { json, metaOf, readBody, withSessionCookie } from '@/lib/server/auth-routes';
import { sessionCookieName } from '@/lib/security/session';

export async function POST(req: Request) {
  const body = await readBody(req);
  const jar = await cookies();
  const result = await secondFactor(jar.get(sessionCookieName())?.value, body.code ?? '', metaOf(req));
  if (!result.ok) return json({ error: result.error }, result.status);
  return withSessionCookie(json({ ok: true }), result.token, result.maxAgeSeconds);
}
