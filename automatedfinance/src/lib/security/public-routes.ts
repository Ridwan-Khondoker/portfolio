// The ONLY routes reachable without a full (password + 2FA) session. Everything else is denied by default.
const TOKEN = '[A-Za-z0-9_-]{20,128}';

const PUBLIC_PAGES: RegExp[] = [/^\/login$/, new RegExp(`^/invite/${TOKEN}$`), new RegExp(`^/reset/${TOKEN}$`)];

const PUBLIC_API: RegExp[] = [
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/verify$/,
  /^\/api\/auth\/logout$/,
  /^\/api\/auth\/enroll$/,
  new RegExp(`^/api/auth/invite/${TOKEN}/password$`),
  new RegExp(`^/api/auth/reset/${TOKEN}/password$`),
];

// Hashed, immutable build output (JS/CSS/fonts). It holds code only, never data; the login page cannot render without it.
const STATIC_PREFIX = '/_next/static/';

export type RouteClass = 'public-page' | 'public-api' | 'static' | 'protected-page' | 'protected-api';

export function classifyRoute(pathname: string): RouteClass {
  if (pathname.startsWith(STATIC_PREFIX) && !pathname.includes('..')) return 'static';
  if (PUBLIC_PAGES.some((r) => r.test(pathname))) return 'public-page';
  if (PUBLIC_API.some((r) => r.test(pathname))) return 'public-api';
  if (pathname === '/api' || pathname.startsWith('/api/')) return 'protected-api';
  return 'protected-page';
}

export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || next.length > 500) return '/';
  if (classifyRoute(next.split('?')[0]!) !== 'protected-page') return '/';
  return next;
}
