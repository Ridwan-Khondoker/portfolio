import { NextResponse, type NextRequest } from 'next/server';
import { appOrigin, ipAllowlist } from '@/lib/env';
import { classifyRoute } from '@/lib/security/public-routes';
import { baseSecurityHeaders, buildCsp } from '@/lib/security/headers';
import { clientIp, ipAllowed } from '@/lib/security/request';
import { sessionCookieName, validateSessionToken } from '@/lib/security/session';

// Deny-by-default guard for every request (no matcher: it runs on all paths, static files included).
// Server actions and route handlers still check the session and role themselves.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function withHeaders(res: NextResponse, csp?: string): NextResponse {
  for (const [k, v] of Object.entries(baseSecurityHeaders())) res.headers.set(k, v);
  if (csp) res.headers.set('Content-Security-Policy', csp);
  return res;
}

function deny(status: 401 | 403, message: string): NextResponse {
  const res = NextResponse.json({ error: message }, { status });
  res.headers.set('Cache-Control', 'no-store');
  return withHeaders(res);
}

function originOk(req: NextRequest): boolean {
  const expected = appOrigin();
  const origin = req.headers.get('origin');
  if (origin) return origin === expected;
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin === expected;
    } catch {
      return false;
    }
  }
  return false;
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const kind = classifyRoute(pathname);

  if (!ipAllowed(clientIp(req.headers), ipAllowlist())) return deny(403, 'Forbidden');

  if (kind === 'static') {
    return withHeaders(NextResponse.next());
  }

  // CSRF: every state-changing request must come from this app's own origin (SameSite=Strict cookies are the second layer;
  // API routes also require the per-session token in X-CSRF-Token).
  if (!SAFE_METHODS.has(req.method) && !originOk(req)) return deny(403, 'Cross-origin request blocked');

  const token = req.cookies.get(sessionCookieName())?.value;
  const session = kind === 'protected-page' || kind === 'protected-api' || kind === 'public-page' ? await validateSessionToken(token, true) : null;
  const authed = !!session?.mfaVerified;

  if ((kind === 'protected-page' || kind === 'protected-api') && !authed) {
    if (kind === 'protected-api' || !SAFE_METHODS.has(req.method)) return deny(401, 'Authentication required');
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('next', pathname + search);
    const res = NextResponse.redirect(url, 302);
    res.headers.set('Cache-Control', 'no-store');
    return withHeaders(res);
  }

  if (kind === 'public-page' && authed && pathname === '/login') {
    return withHeaders(NextResponse.redirect(new URL('/', req.url), 302));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Cache-Control', 'no-store, max-age=0');
  return withHeaders(res, csp);
}
