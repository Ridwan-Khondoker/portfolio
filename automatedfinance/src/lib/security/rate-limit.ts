import { prisma } from '@/lib/db';

export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;

/** Keys look like "login:ip:1.2.3.4" or "login:acct:someone@example.com". */
export async function isLocked(keys: string[]): Promise<boolean> {
  const rows = await prisma.rateLimit.findMany({ where: { key: { in: keys } } });
  const now = Date.now();
  return rows.some((r) => r.lockedUntil && r.lockedUntil.getTime() > now);
}

export async function recordFailure(keys: string[]): Promise<void> {
  const now = new Date();
  for (const key of keys) {
    await prisma.$transaction(async (tx) => {
      const row = await tx.rateLimit.findUnique({ where: { key } });
      const fresh = !row || now.getTime() - row.windowStart.getTime() > WINDOW_MS || (row.lockedUntil && row.lockedUntil <= now);
      const failures = fresh ? 1 : row!.failures + 1;
      const lockedUntil = failures >= MAX_FAILURES ? new Date(now.getTime() + LOCKOUT_MS) : null;
      await tx.rateLimit.upsert({
        where: { key },
        create: { key, failures, windowStart: now, lockedUntil },
        update: { failures: lockedUntil ? 0 : failures, windowStart: fresh ? now : row!.windowStart, lockedUntil },
      });
    });
  }
}

export async function clearFailures(keys: string[]): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key: { in: keys } } });
}
