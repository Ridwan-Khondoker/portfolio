import { passwordSignIn } from '@/lib/server/accounts';
import { json, metaOf, readBody, withSessionCookie } from '@/lib/server/auth-routes';

export async function POST(req: Request) {
  const body = await readBody(req);
  const result = await passwordSignIn(body.email ?? '', body.password ?? '', metaOf(req));
  if (!result.ok) return json({ error: result.error }, result.status);
  return withSessionCookie(json({ ok: true, next: result.next }), result.token, result.maxAgeSeconds);
}
