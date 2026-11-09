// Central access to environment variables. Nothing secret is ever logged or sent to the client.

export function appUrl(): URL {
  return new URL(process.env.APP_URL || 'http://localhost:3000');
}

export function appOrigin(): string {
  return appUrl().origin;
}

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET || '';
  if (s.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters.');
  return s;
}

/** Cookies get the Secure flag (and the __Host- prefix) whenever the app is served over HTTPS. */
export function secureCookies(): boolean {
  return appUrl().protocol === 'https:';
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Optional comma-separated list of IPs or IPv4 CIDR ranges. Empty = no IP restriction. */
export function ipAllowlist(): string[] {
  return (process.env.IP_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function googleServiceAccount(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    if (parsed.client_email && parsed.private_key) return parsed;
  } catch {
    /* fall through */
  }
  return null;
}
