// Acceptance test 7 (HTTP level, against a production build): every non-public route returns 401 or redirects when
// logged out; viewers and editors cannot reach higher-role pages or APIs; lockout, timeouts, CSRF and headers hold.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { totpAt } from '@/lib/security/totp';
import { resetDb } from '../db';
import { makeUser, PASSWORD } from './helpers';

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const ORIGIN = { origin: BASE };
const manifestPath = path.join(process.cwd(), '.next', 'app-path-routes-manifest.json');
const hasBuild = fs.existsSync(manifestPath);
const suite = hasBuild ? describe : describe.skip;
if (!hasBuild) console.warn('[security] no production build found: run `npm run build` first (npm run test:security does this).');

let server: ChildProcess | null = null;
const TOKEN = 'A'.repeat(43);

function routes() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, string>;
  return [...new Set(Object.values(manifest))]
    .filter((r) => !r.startsWith('/_'))
    .map((r) => r.replace('[token]', TOKEN).replace('[batchId]', 'cmissingbatch0000000000000').replace('[id]', 'missing'));
}
const isPublic = (p: string) => p === '/login' || p.startsWith('/invite/') || p.startsWith('/reset/') || p.startsWith('/api/auth/');

async function req(p: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  return fetch(BASE + p, { ...init, headers, redirect: 'manual' });
}

function cookieFrom(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');
}

let stepOffset = 0;
async function signIn(email: string, secret: string): Promise<string> {
  const r1 = await req('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', ...ORIGIN }, body: JSON.stringify({ email, password: PASSWORD }) });
  expect(r1.status, await r1.clone().text()).toBe(200);
  const pending = cookieFrom(r1);
  // Codes can't be replayed, so repeated test sign-ins within one 30-second step clear the replay marker first
  // (the replay guard itself is tested separately below).
  await prisma.user.update({ where: { email }, data: { totpLastStep: null } });
  const code = totpAt(secret, Date.now() + (stepOffset++ % 2) * 30_000);
  const r2 = await req('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json', ...ORIGIN }, body: JSON.stringify({ code }), cookie: pending });
  expect(r2.status, await r2.clone().text()).toBe(200);
  return cookieFrom(r2);
}

suite('acceptance 7: access control (production build over HTTP)', () => {
  let viewer: Awaited<ReturnType<typeof makeUser>>;
  let editor: Awaited<ReturnType<typeof makeUser>>;
  let admin: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    await resetDb();
    viewer = await makeUser('viewer@example.test', 'VIEWER');
    editor = await makeUser('editor@example.test', 'EDITOR');
    admin = await makeUser('admin@example.test', 'ADMIN');
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
      env: { ...process.env, APP_URL: BASE, NODE_ENV: 'production', DISABLE_SCHEDULER: '1' },
      stdio: 'ignore',
      detached: true,
    });
    for (let i = 0; i < 120; i++) {
      try {
        const r = await fetch(`${BASE}/login`);
        if (r.status === 200) return;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('server did not start');
  });

  afterAll(() => {
    if (server?.pid) process.kill(-server.pid, 'SIGTERM');
  });

  it('every non-public route redirects (pages) or returns 401 (APIs) when logged out', async () => {
    const all = [...routes(), '/does-not-exist', '/api/does-not-exist', '/.env', '/package.json', '/prisma/schema.prisma', '/source-workbooks/x.xlsx', '/data/master_expenses.csv'];
    const failures: string[] = [];
    for (const p of all) {
      if (isPublic(p)) continue;
      const api = p.startsWith('/api/');
      const get = await req(p);
      if (api ? get.status !== 401 : !(get.status === 302 && (get.headers.get('location') ?? '').includes('/login'))) failures.push(`GET ${p} -> ${get.status} ${get.headers.get('location') ?? ''}`);
      const post = await req(p, { method: 'POST', headers: { ...ORIGIN, 'content-type': 'application/x-www-form-urlencoded' }, body: 'x=1' });
      if (post.status !== 401) failures.push(`POST ${p} -> ${post.status}`);
      const body = await get.text();
      if (/\$\d{1,3}(,\d{3})+/.test(body)) failures.push(`GET ${p} leaked a dollar figure`);
    }
    expect(failures).toEqual([]);
  });

  it('public routes are only the login, invite and reset pages and the auth API', async () => {
    expect((await req('/login')).status).toBe(200);
    expect((await req(`/invite/${TOKEN}`)).status).toBe(200); // renders "link not valid", no data
    expect((await req(`/reset/${TOKEN}`)).status).toBe(200);
    const pub = routes().filter(isPublic);
    expect(pub.every((p) => p === '/login' || /^\/(invite|reset)\//.test(p) || p.startsWith('/api/auth/'))).toBe(true);
  });

  it('sets security headers on every response, including redirects and 401s', async () => {
    for (const p of ['/login', '/', '/api/export/all', '/icon.svg']) {
      const r = await req(p);
      expect(r.headers.get('x-frame-options'), p).toBe('DENY');
      expect(r.headers.get('referrer-policy'), p).toBe('no-referrer');
      expect(r.headers.get('x-robots-tag'), p).toContain('noindex');
      expect(r.headers.get('x-content-type-options'), p).toBe('nosniff');
    }
    const csp = (await req('/login')).headers.get('content-security-policy') ?? '';
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-eval');
  });

  it('blocks cross-site state changes (CSRF)', async () => {
    const noOrigin = await req('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(noOrigin.status).toBe(403);
    const evil = await req('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
    expect(evil.status).toBe(403);
  });

  it('uses one generic error and locks an account after 5 failures (from any IP)', async () => {
    let ip = 20;
    const attempt = (email: string, password: string, fromIp = `10.0.1.${ip++}`) =>
      req('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', ...ORIGIN, 'x-real-ip': fromIp }, body: JSON.stringify({ email, password }) });
    const unknown = await attempt('nobody@example.test', 'wrong-password-123');
    const wrong = await attempt('viewer@example.test', 'wrong-password-123');
    expect(unknown.status).toBe(401);
    expect((await unknown.json()).error).toBe((await wrong.json()).error);
    for (let i = 0; i < 4; i++) expect((await attempt('viewer@example.test', 'wrong-password-123')).status).toBe(401);
    // 5 failures on the account (each from a different IP): even the right password is refused for 15 minutes.
    const locked = await attempt('viewer@example.test', PASSWORD);
    expect(locked.status).toBe(429);
    await prisma.rateLimit.deleteMany();
  });

  it('locks an IP after 5 failures across accounts', async () => {
    const fromOneIp = (email: string, password: string) =>
      req('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', ...ORIGIN, 'x-real-ip': '10.0.2.1' }, body: JSON.stringify({ email, password }) });
    for (let i = 0; i < 5; i++) await fromOneIp(`guess${i}@example.test`, 'wrong-password-123');
    expect((await fromOneIp(editor.email, PASSWORD)).status).toBe(429);
    await prisma.rateLimit.deleteMany();
  });

  it('a 2FA code cannot be used twice', async () => {
    await prisma.user.update({ where: { id: admin.id }, data: { totpLastStep: null } });
    const code = totpAt(admin.secret, Date.now());
    const once = async () => {
      const r1 = await req('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', ...ORIGIN }, body: JSON.stringify({ email: admin.email, password: PASSWORD }) });
      return req('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json', ...ORIGIN }, body: JSON.stringify({ code }), cookie: cookieFrom(r1) });
    };
    expect((await once()).status).toBe(200);
    expect((await once()).status).toBe(401);
    await prisma.rateLimit.deleteMany();
  });

  it('a password alone (no 2FA code yet) opens nothing', async () => {
    const r1 = await req('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', ...ORIGIN }, body: JSON.stringify({ email: viewer.email, password: PASSWORD }) });
    const pending = cookieFrom(r1);
    const r = await req('/', { cookie: pending });
    expect(r.status).toBe(302);
    expect((await req('/api/export/transactions', { cookie: pending })).status).toBe(401);
  });

  it('viewers can read reports but cannot reach Editor or Admin pages and APIs', async () => {
    const c = await signIn(viewer.email, viewer.secret);
    for (const p of ['/', '/transactions', '/projections', '/recurring', '/quality', '/reconciliation', '/account']) expect((await req(p, { cookie: c })).status, p).toBe(200);
    for (const p of ['/upload', '/upload/cmissingbatch0000000000000', '/settings', '/users']) {
      const r = await req(p, { cookie: c });
      expect([302, 303, 307], p).toContain(r.status);
      expect(r.headers.get('location') ?? '', p).toContain('denied=1');
    }
    for (const p of ['/api/export/all', '/api/files/missing', '/api/template']) expect((await req(p, { cookie: c })).status, p).toBe(403);
    expect((await req('/api/export/transactions?format=csv', { cookie: c })).status).toBe(200);
  });

  it('editors can upload but cannot reach Admin pages and APIs', async () => {
    const c = await signIn(editor.email, editor.secret);
    expect((await req('/upload', { cookie: c })).status).toBe(200);
    expect((await req('/api/template', { cookie: c })).status).toBe(200);
    for (const p of ['/settings', '/users']) expect((await req(p, { cookie: c })).headers.get('location') ?? '', p).toContain('denied=1');
    for (const p of ['/api/export/all', '/api/files/missing']) expect((await req(p, { cookie: c })).status, p).toBe(403);
  });

  it('admins reach everything; sessions end on idle timeout, absolute timeout, deactivation and sign-out', async () => {
    const c = await signIn(admin.email, admin.secret);
    for (const p of ['/settings', '/users', '/upload']) expect((await req(p, { cookie: c })).status, p).toBe(200);
    expect((await req('/api/export/all', { cookie: c })).status).toBe(200);
    const cookieValue = (c: string) => c.split('=').slice(1).join('=');

    const s1 = await signIn(viewer.email, viewer.secret);
    const { sha256 } = await import('@/lib/security/crypto');
    await prisma.session.update({ where: { tokenHash: sha256(cookieValue(s1)) }, data: { lastSeenAt: new Date(Date.now() - 13 * 3600_000) } });
    expect((await req('/', { cookie: s1 })).status).toBe(302);

    const s2 = await signIn(viewer.email, viewer.secret);
    await prisma.session.update({ where: { tokenHash: sha256(cookieValue(s2)) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await req('/', { cookie: s2 })).status).toBe(302);

    const s3 = await signIn(editor.email, editor.secret);
    expect((await req('/', { cookie: s3 })).status).toBe(200);
    const { revokeAllSessions } = await import('@/lib/security/session');
    await prisma.user.update({ where: { id: editor.id }, data: { active: false } });
    await revokeAllSessions(editor.id, 'account deactivated');
    expect((await req('/', { cookie: s3 })).status).toBe(302);

    const out = await req('/api/auth/logout', { method: 'POST', headers: ORIGIN, cookie: c });
    expect(out.status).toBe(200);
    expect((await req('/settings', { cookie: c })).status).toBe(302);
  });

  it('audit log records successful and failed logins with IP', async () => {
    const rows = await prisma.auditLog.findMany({ where: { action: { in: ['login.success', 'login.failed', 'login.locked'] } } });
    expect(rows.some((r) => r.action === 'login.success' && r.ip)).toBe(true);
    expect(rows.some((r) => r.action === 'login.failed')).toBe(true);
    expect(rows.some((r) => r.action === 'login.locked')).toBe(true);
  });
});
