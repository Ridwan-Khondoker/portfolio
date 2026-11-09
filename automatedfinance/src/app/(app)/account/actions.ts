'use server';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requestMeta, requireActionUser } from '@/lib/server/auth';
import { run, str } from '@/lib/server/actions';
import { hashPassword, passwordProblem, verifyPassword } from '@/lib/security/password';
import { decrypt, sha256 } from '@/lib/security/crypto';
import { verifyTotp } from '@/lib/security/totp';
import { clearFailures, isLocked, recordFailure } from '@/lib/security/rate-limit';
import { revokeSession } from '@/lib/security/session';
import { audit } from '@/lib/security/audit';
import type { ActionResult } from '@/components/ui/ActionForm';

export async function changePasswordAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireActionUser('VIEWER');
    const meta = await requestMeta();
    const keys = [`pw:acct:${me.email}`];
    if (await isLocked(keys)) throw new Error('Too many attempts. Wait 15 minutes.');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.userId } });
    if (!user.passwordHash || !(await verifyPassword(user.passwordHash, str(fd, 'current')))) {
      await recordFailure(keys);
      throw new Error('Your current password is not right.');
    }
    const next = str(fd, 'password');
    if (next !== str(fd, 'confirm')) throw new Error('The new passwords do not match.');
    const problem = passwordProblem(next, me.email);
    if (problem) throw new Error(problem);
    await clearFailures(keys);
    await prisma.user.update({ where: { id: me.userId }, data: { passwordHash: await hashPassword(next) } });
    // End every other session; this one stays signed in.
    await prisma.session.updateMany({ where: { userId: me.userId, revokedAt: null, id: { not: me.sessionId } }, data: { revokedAt: new Date(), revokeReason: 'password changed' } });
    await audit({ action: 'account.password_changed', userId: me.userId, email: me.email, ...meta });
    return { ok: true, message: 'Password changed. Your other sessions were signed out.' };
  });
}

export async function newRecoveryCodesAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireActionUser('VIEWER');
    const meta = await requestMeta();
    const keys = [`mfa:acct:${me.email}`];
    if (await isLocked(keys)) throw new Error('Too many attempts. Wait 15 minutes.');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.userId } });
    const step = user.totpSecretEnc ? verifyTotp(decrypt(user.totpSecretEnc), str(fd, 'code')) : null;
    if (step === null || (user.totpLastStep !== null && step <= user.totpLastStep)) {
      await recordFailure(keys);
      throw new Error('That code did not work.');
    }
    await clearFailures(keys);
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    const codes = Array.from({ length: 8 }, () => {
      const chars = Array.from(crypto.randomBytes(10), (b) => alphabet[b % alphabet.length]).join('');
      return `${chars.slice(0, 5)}-${chars.slice(5)}`;
    });
    await prisma.$transaction([
      prisma.user.update({ where: { id: me.userId }, data: { totpLastStep: step } }),
      prisma.recoveryCode.deleteMany({ where: { userId: me.userId } }),
      prisma.recoveryCode.createMany({ data: codes.map((c) => ({ userId: me.userId, codeHash: sha256(c.replace(/[^a-z0-9]/g, '')) })) }),
    ]);
    await audit({ action: 'account.recovery_codes_regenerated', userId: me.userId, email: me.email, ...meta });
    return { ok: true, message: `New recovery codes (the old ones no longer work). Save them now: ${codes.join('  ')}` };
  });
}

export async function endMySessionAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const me = await requireActionUser('VIEWER');
    const id = str(fd, 'sessionId');
    const s = await prisma.session.findUnique({ where: { id } });
    if (!s || s.userId !== me.userId) throw new Error('Session not found.');
    await revokeSession(id, 'ended by user');
    await audit({ action: 'session.revoked', userId: me.userId, email: me.email, details: { sessionId: id, self: true }, ...(await requestMeta()) });
    revalidatePath('/account');
    return { ok: true, message: 'Session ended.' };
  });
}
