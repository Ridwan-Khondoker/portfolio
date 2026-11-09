'use server';

import { revalidatePath } from 'next/cache';
import { requestMeta, requireActionUser } from '@/lib/server/auth';
import { run, str } from '@/lib/server/actions';
import { deleteManualEntry, manualSchema, saveManualEntry, setPaymentStatus } from '@/lib/server/manual';
import type { ActionResult } from '@/components/ui/ActionForm';

export async function setStatusAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireActionUser('EDITOR');
    await setPaymentStatus(str(fd, 'key'), str(fd, 'status'), str(fd, 'dueDate') || null, user.userId, str(fd, 'note') || null, await requestMeta());
    revalidatePath('/transactions');
    revalidatePath('/');
    return { ok: true, message: 'Saved' };
  });
}

export async function saveManualAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireActionUser('EDITOR');
    const parsed = manualSchema.safeParse(Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')).map(([k, v]) => [k, typeof v === 'string' ? v : ''])));
    if (!parsed.success) return { ok: false, message: parsed.error.issues.map((i) => i.message).join(' ') };
    const key = str(fd, 'key') || undefined;
    await saveManualEntry(parsed.data, user.userId, await requestMeta(), key);
    revalidatePath('/transactions');
    revalidatePath('/');
    return { ok: true, message: key ? 'Entry updated.' : 'Entry added. It is now in every total and chart.' };
  });
}

export async function deleteManualAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireActionUser('EDITOR');
    await deleteManualEntry(str(fd, 'key'), user.userId, await requestMeta());
    revalidatePath('/transactions');
    revalidatePath('/');
    return { ok: true, message: 'Entry deleted (it can be restored by rolling back its batch).' };
  });
}
