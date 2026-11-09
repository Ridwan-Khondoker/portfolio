// Shared bodies for the public auth API routes.
import { NextResponse } from 'next/server';
import type { TokenKind } from '@prisma/client';
import { clientIp, userAgent } from '@/lib/security/request';
import { sessionCookieName, sessionCookieOptions } from '@/lib/security/session';
import { completeLink, findValidLink, setLinkPassword } from './accounts';
import { createSession } from '@/lib/security/session';

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

const INVALID_LINK = 'This link is invalid, expired or already used. Ask an admin for a new one.';

export async function linkPasswordStep(req: Request, token: string, kind: TokenKind) {
  const row = await findValidLink(token, kind);
  if (!row) return json({ error: INVALID_LINK }, 410);
  const body = await readBody(req);
  if ((body.password ?? '') !== (body.confirm ?? '')) return json({ error: 'The two passwords do not match.' }, 400);
  const problem = await setLinkPassword(row, body.password ?? '');
  if (problem) return json({ error: problem }, 400);
  return json({ ok: true });
}

export async function linkTotpStep(req: Request, token: string, kind: TokenKind) {
  const row = await findValidLink(token, kind);
  if (!row) return json({ error: INVALID_LINK }, 410);
  const body = await readBody(req);
  const meta = metaOf(req);
  try {
    const result = await completeLink(row, body.code ?? '', meta);
    if (!result.ok) return json({ error: result.error }, 400);
    const session = await createSession({ userId: result.userId, mfaVerified: true, ip: meta.ip, userAgent: meta.userAgent });
    return withSessionCookie(json({ ok: true, recoveryCodes: result.recoveryCodes }), session.token, session.maxAgeSeconds);
  } catch (err) {
    return json({ error: (err as Error).message || INVALID_LINK }, 400);
  }
}
