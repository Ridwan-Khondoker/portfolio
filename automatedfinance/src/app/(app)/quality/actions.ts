'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requestMeta, requireActionUser } from '@/lib/server/auth';
import { run, str } from '@/lib/server/actions';
import { audit } from '@/lib/security/audit';
import type { ActionResult } from '@/components/ui/ActionForm';

export async function resolveIssue(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireActionUser('ADMIN');
    const n = Number(str(fd, 'n'));
    const reopen = str(fd, 'reopen') === '1';
    const note = str(fd, 'note');
    if (!reopen && !note) throw new Error('Add a short note saying how it was resolved.');
    await prisma.issueLogItem.update({
      where: { n },
      data: reopen ? { resolved: false, resolutionNote: null, resolvedById: null, resolvedAt: null } : { resolved: true, resolutionNote: note.slice(0, 1000), resolvedById: user.userId, resolvedAt: new Date() },
    });
    await audit({ action: reopen ? 'issue.reopen' : 'issue.resolve', userId: user.userId, target: `issue #${n}`, details: { note }, ...(await requestMeta()) });
    revalidatePath('/quality');
    return { ok: true, message: reopen ? 'Reopened.' : 'Marked resolved.' };
  });
}

export async function resolveFlag(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireActionUser('ADMIN');
    const flagKey = str(fd, 'flagKey');
    const reopen = str(fd, 'reopen') === '1';
    const note = str(fd, 'note');
    if (reopen) await prisma.flagResolution.delete({ where: { flagKey } });
    else {
      if (!note) throw new Error('Add a short note.');
      await prisma.flagResolution.upsert({ where: { flagKey }, create: { flagKey, note: note.slice(0, 1000), resolvedById: user.userId }, update: { note: note.slice(0, 1000), resolvedById: user.userId, resolvedAt: new Date() } });
    }
    await audit({ action: reopen ? 'flag.reopen' : 'flag.resolve', userId: user.userId, target: flagKey, details: { note }, ...(await requestMeta()) });
    revalidatePath('/quality');
    return { ok: true, message: reopen ? 'Reopened.' : 'Marked resolved.' };
  });
}
