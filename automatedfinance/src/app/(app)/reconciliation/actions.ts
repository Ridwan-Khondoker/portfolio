'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requestMeta, requireActionUser } from '@/lib/server/auth';
import { run, str } from '@/lib/server/actions';
import { audit } from '@/lib/security/audit';
import type { ActionResult } from '@/components/ui/ActionForm';

/** Admin accepts the current difference of a check as explained (with a note). Any later change turns it back to CHECK. */
export async function explainCheck(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireActionUser('ADMIN');
    const id = str(fd, 'id');
    const explanation = str(fd, 'explanation');
    const difference = str(fd, 'difference');
    if (!explanation) throw new Error('Write the explanation.');
    if (!/^-?\d+(\.\d+)?$/.test(difference)) throw new Error('No difference to explain.');
    await prisma.reconciliationCheck.update({ where: { id }, data: { explanation: explanation.slice(0, 2000), explainedDifference: difference } });
    await audit({ action: 'reconciliation.explain', userId: user.userId, target: id, details: { difference, explanation }, ...(await requestMeta()) });
    revalidatePath('/reconciliation');
    return { ok: true, message: 'Saved as explained.' };
  });
}
