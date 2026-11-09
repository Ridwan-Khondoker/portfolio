'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requestMeta, requireActionUser } from '@/lib/server/auth';
import { run, str } from '@/lib/server/actions';
import { audit } from '@/lib/security/audit';
import { FREQUENCIES } from '@/lib/finance/recurring';
import type { ActionResult } from '@/components/ui/ActionForm';

export async function saveRecurringMeta(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireActionUser('EDITOR');
    const itemKey = str(fd, 'itemKey');
    const department = str(fd, 'department') || null;
    const frequency = str(fd, 'frequency') || null;
    const match = fd.get('snapshotMatch');
    if (frequency && !FREQUENCIES.some((f) => f.name === frequency)) throw new Error('Unknown frequency.');
    const snapshotMatch = match === '__auto' ? null : typeof match === 'string' ? match : null;
    await prisma.recurringItemMeta.upsert({ where: { itemKey }, create: { itemKey, department, frequency, snapshotMatch }, update: { department, frequency, snapshotMatch } });
    await audit({ action: 'recurring.meta', userId: user.userId, target: itemKey, details: { department, frequency, snapshotMatch }, ...(await requestMeta()) });
    revalidatePath('/recurring');
    return { ok: true, message: 'Saved' };
  });
}
