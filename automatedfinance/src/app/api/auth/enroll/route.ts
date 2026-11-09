import { cookies } from 'next/headers';
import { enrollAtSignIn } from '@/lib/server/accounts';
import { json, metaOf, readBody, withSessionCookie } from '@/lib/server/auth-routes';
import { sessionCookieName } from '@/lib/security/session';

/** Two-step verification set-up at sign-in, used only when Settings requires it for the person's role. */
export async function POST(req: Request) {
  const body = await readBody(req);
  const jar = await cookies();
  const result = await enrollAtSignIn(jar.get(sessionCookieName())?.value, body.code ?? '', metaOf(req));
  if (!result.ok) return json({ error: result.error }, result.status);
  return withSessionCookie(json({ ok: true, recoveryCodes: result.recoveryCodes }), result.token, result.maxAgeSeconds);
}
