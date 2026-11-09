// Shared bodies for the public auth API routes.
import { NextResponse } from 'next/server';
import type { TokenKind } from '@prisma/client';
import { clientIp, userAgent } from '@/lib/security/request';
import { sessionCookieName, sessionCookieOptions } from '@/lib/security/session';
import { completeLinkWithPassword, findValidLink, INVALID_LINK } from './accounts';

export function metaOf(req: Request) {
  return { ip: clientIp(req.headers), userAgent: userAgent(req.headers) };
}

export async function readBody(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') || '';
  try {
    if (type.includes('application/json')) {
      const j = (await req.json()) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, typeof v === 'string' ? v : String(v ?? '')]));
    }
    const f = await req.formData();
    return Object.fromEntries([...f.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));
  } catch {
    return {};
  }
}

export function json(data: unknown, status = 200): NextResponse {
  const res = NextResponse.json(data, { status });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export function withSessionCookie(res: NextResponse, token: string, maxAgeSeconds: number): NextResponse {
  res.cookies.set(sessionCookieName(), token, sessionCookieOptions(maxAgeSeconds));
  return res;
}

/** Invite or reset link: choose a password, signed in. */
export async function linkPasswordStep(req: Request, token: string, kind: TokenKind) {
  const row = await findValidLink(token, kind);
  if (!row) return json({ error: INVALID_LINK }, 410);
  const body = await readBody(req);
  const result = await completeLinkWithPassword(row, body.password ?? '', body.confirm ?? '', metaOf(req));
  if (!result.ok) return json({ error: result.error }, result.status);
  return withSessionCookie(json({ ok: true, next: result.next }), result.token, result.maxAgeSeconds);
}
