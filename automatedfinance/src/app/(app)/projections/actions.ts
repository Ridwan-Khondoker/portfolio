'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requestMeta, requireActionUser } from '@/lib/server/auth';
import { money, pct, run, str } from '@/lib/server/actions';
import { audit } from '@/lib/security/audit';
import { isYm } from '@/lib/months';
import type { ActionResult } from '@/components/ui/ActionForm';

export async function saveScenarios(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireActionUser('EDITOR');
    const scenarios = await prisma.scenario.findMany();
    for (const s of scenarios) {
      const k = s.key;
      await prisma.scenario.update({
        where: { key: k },
        data: {
          ...(s.growthOverBase !== null ? { growthOverBase: pct(fd, `${k}.growthOverBase`) } : { growth: pct(fd, `${k}.growth`) }),
          inflation: pct(fd, `${k}.inflation`),
          fixAdjPct: pct(fd, `${k}.fixAdjPct`),
          fixAdjAmt: money(fd, `${k}.fixAdjAmt`),
          varAdjPct: pct(fd, `${k}.varAdjPct`),
          includePlanned: str(fd, `${k}.includePlanned`) === 'on',
          contingency: pct(fd, `${k}.contingency`),
        },
      });
    }
    await audit({ action: 'settings.scenarios', userId: user.userId, ...(await requestMeta()) });
    revalidatePath('/projections');
    return { ok: true, message: 'Scenario assumptions saved. Projections recalculated.' };
  });
}

export async function saveSeasonality(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireActionUser('EDITOR');
    for (let m = 1; m <= 12; m++) {
      const raw = str(fd, `m${m}`);
      if (!/^\d+(\.\d+)?$/.test(raw) || Number(raw) <= 0 || Number(raw) > 5) throw new Error(`Month ${m}: use an index like 1.00 (between 0 and 5).`);
      await prisma.seasonalityIndex.upsert({ where: { month: m }, create: { month: m, idx: raw }, update: { idx: raw } });
    }
    await audit({ action: 'settings.seasonality', userId: user.userId, ...(await requestMeta()) });
    revalidatePath('/projections');
    return { ok: true, message: 'Seasonality saved.' };
  });
}

export async function addPlanned(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireActionUser('EDITOR');
    const description = str(fd, 'description');
    const month = str(fd, 'month');
    const department = str(fd, 'department');
    if (!description) throw new Error('Add a description.');
    if (!isYm(month)) throw new Error('Choose a month.');
    if (!department) throw new Error('Choose a business.');
    const p = await prisma.plannedExpense.create({
      data: {
        description: description.slice(0, 200),
        month: new Date(`${month}-01T00:00:00Z`),
        department,
        amount: money(fd, 'amount'),
        inConservative: str(fd, 'inConservative') === 'on',
        inBase: str(fd, 'inBase') === 'on',
        inHigh: str(fd, 'inHigh') === 'on',
      },
    });
    await audit({ action: 'planned.add', userId: user.userId, target: p.description, details: { month, department }, ...(await requestMeta()) });
    revalidatePath('/projections');
    return { ok: true, message: 'Planned expense added.' };
  });
}

export async function deletePlanned(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await requireActionUser('EDITOR');
    const id = str(fd, 'id');
    const p = await prisma.plannedExpense.delete({ where: { id } });
    await audit({ action: 'planned.delete', userId: user.userId, target: p.description, ...(await requestMeta()) });
    revalidatePath('/projections');
    return { ok: true, message: 'Removed.' };
  });
}
