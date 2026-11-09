import { isProduction, secureCookies } from '@/lib/env';

export function buildCsp(nonce: string): string {
  const dev = !isProduction();
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // React style attributes (e.g. chart sizing) are attributes, not injectable <style> blocks.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    ...(secureCookies() ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/** Headers set on every response, including redirects, 401s and static files. */
export function baseSecurityHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
    'X-Content-Type-Options': 'nosniff',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  if (secureCookies()) h['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
  return h;
}
