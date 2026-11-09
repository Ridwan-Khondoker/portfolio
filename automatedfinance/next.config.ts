import type { NextConfig } from 'next';

// Security headers that do not depend on the request are set here; the per-request CSP nonce is set in src/proxy.ts.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  reactStrictMode: true,
  serverExternalPackages: ['@node-rs/argon2', 'xlsx', '@prisma/client', 'google-auth-library'],
  experimental: {
    serverActions: { bodySizeLimit: '25mb' },
    proxyClientMaxBodySize: '25mb',
  },
};

export default nextConfig;
