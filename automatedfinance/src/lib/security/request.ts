// Request metadata helpers shared by the proxy, route handlers and server actions.

type HeaderSource = { get(name: string): string | null };

/** Railway's edge sets X-Real-IP to the client address. Fall back to the first X-Forwarded-For entry locally. */
export function clientIp(h: HeaderSource): string {
  const real = h.get('x-real-ip');
  if (real) return real.trim();
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return 'unknown';
}

export function userAgent(h: HeaderSource): string {
  return (h.get('user-agent') || '').slice(0, 300);
}

function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

/** Exact match for any IP, or IPv4 CIDR ranges like 203.0.113.0/24. */
export function ipAllowed(ip: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  const clean = ip.replace(/^::ffff:/, '');
  for (const entry of allowlist) {
    if (entry === clean || entry === ip) return true;
    const [base, bitsStr] = entry.split('/');
    if (!bitsStr) continue;
    const bits = Number(bitsStr);
    const a = ipv4ToInt(clean);
    const b = ipv4ToInt(base!);
    if (a === null || b === null || !(bits >= 0 && bits <= 32)) continue;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if ((a & mask) === (b & mask)) return true;
  }
  return false;
}
