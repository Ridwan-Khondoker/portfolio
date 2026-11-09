// Acceptance test 7 (server actions): every server action checks the role itself, independent of the request guard.
// Each exported action is called as a Viewer (and Editor) with an empty form; anything above that role must refuse.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { createSession } from '@/lib/security/session';
import { resetDb } from '../db';
import { makeUser } from './helpers';

let token = '';
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (token ? { value: token } : undefined), set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers({ 'x-real-ip': '127.0.0.1', 'user-agent': 'vitest' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` });
  },
}));

function actionFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return actionFiles(p);
    return e.name === 'actions.ts' || (dir.endsWith(`${path.sep}actions`) && e.name.endsWith('.ts')) ? [p] : [];
  });
}

// Where each action module sits in the role ladder. Anything not listed here fails the test, so new actions must be classified.
const REQUIRED: Record<string, 'VIEWER' | 'EDITOR' | 'ADMIN'> = {
  'account/actions.ts': 'VIEWER',
  'actions/session.ts': 'VIEWER',
  'transactions/actions.ts': 'EDITOR',
  'projections/actions.ts': 'EDITOR',
  'recurring/actions.ts': 'EDITOR',
  'upload/actions.ts': 'EDITOR',
  'quality/actions.ts': 'ADMIN',
  'reconciliation/actions.ts': 'ADMIN',
  'settings/actions.ts': 'ADMIN',
  'users/actions.ts': 'ADMIN',
};
const ADMIN_ONLY_EXPORTS = new Set(['upload/actions.ts#rollbackAction']);

describe('acceptance 7: server actions enforce roles', () => {
  const root = path.join(process.cwd(), 'src', 'app');
  const files = actionFiles(root);

  beforeAll(async () => {
    await resetDb();
  });

  it('every action module is classified', () => {
    const rel = files.map((f) => path.relative(path.join(root, '(app)'), f).split(path.sep).join('/'));
    expect(rel.filter((r) => !(r in REQUIRED))).toEqual([]);
  });

  for (const role of ['VIEWER', 'EDITOR'] as const) {
    it(`${role.toLowerCase()}s are refused by every action above their role`, async () => {
      const u = await makeUser(`${role.toLowerCase()}-actions@example.test`, role);
      token = (await createSession({ userId: u.id, mfaVerified: true, ip: '127.0.0.1', userAgent: 'vitest' })).token;
      const rank = { VIEWER: 1, EDITOR: 2, ADMIN: 3 };
      const leaks: string[] = [];
      let checked = 0;
      for (const file of files) {
        const rel = path.relative(path.join(root, '(app)'), file).split(path.sep).join('/');
        const mod = (await import(file)) as Record<string, unknown>;
        for (const [name, fn] of Object.entries(mod)) {
          if (typeof fn !== 'function') continue;
          const needed = ADMIN_ONLY_EXPORTS.has(`${rel}#${name}`) ? 'ADMIN' : REQUIRED[rel]!;
          if (rank[needed] <= rank[role]) continue;
          checked++;
          let result: unknown;
          try {
            result = await (fn as (a: unknown, b: FormData) => Promise<unknown>)(null, new FormData());
          } catch (e) {
            result = { thrown: (e as Error).message };
          }
          const r = result as { ok?: boolean; message?: string; thrown?: string };
          const refused = (r?.ok === false && /permission/i.test(r.message ?? '')) || /permission/i.test(r?.thrown ?? '');
          if (!refused) leaks.push(`${rel}#${name} -> ${JSON.stringify(result).slice(0, 160)}`);
        }
      }
      expect(checked).toBeGreaterThan(0);
      expect(leaks).toEqual([]);
      // Nothing was written by the refused calls.
      expect(await prisma.importBatch.count()).toBe(0);
      expect(await prisma.googleSheetSource.count()).toBe(0);
    });
  }

  it('a signed-out caller is refused by every action', async () => {
    token = '';
    const leaks: string[] = [];
    for (const file of files) {
      const mod = (await import(file)) as Record<string, unknown>;
      for (const [name, fn] of Object.entries(mod)) {
        if (typeof fn !== 'function' || name === 'signOutAction') continue;
        const r = (await (fn as (a: unknown, b: FormData) => Promise<{ ok?: boolean; message?: string }>)(null, new FormData()).catch((e: Error) => ({ ok: false, message: e.message }))) ?? {};
        if (r.ok !== false || !/session has ended|permission/i.test(r.message ?? '')) leaks.push(`${path.basename(path.dirname(file))}#${name}`);
      }
    }
    expect(leaks).toEqual([]);
  });
});
