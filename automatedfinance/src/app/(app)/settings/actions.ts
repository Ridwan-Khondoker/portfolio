'use server';

import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requestMeta, requireActionUser } from '@/lib/server/auth';
import { money, run, str } from '@/lib/server/actions';
import { audit } from '@/lib/security/audit';
import { isYmd } from '@/lib/months';
import { parseSheetId } from '@/lib/server/google-sync';
import type { ActionResult } from '@/components/ui/ActionForm';

const TYPES = ['Fixed', 'Variable', 'Non-operating', 'Unclassified'];

async function admin() {
  const user = await requireActionUser('ADMIN');
  return { user, meta: await requestMeta() };
}

function done(message = 'Saved. Every page uses the new values.') {
  revalidatePath('/', 'layout');
  return { ok: true, message };
}

export async function saveGeneral(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const { user, meta } = await admin();
    const asOf = str(fd, 'asOfDate');
    if (asOf && !isYmd(asOf)) throw new Error('As-of date must be a valid date, or blank for today.');
    const int = (k: string, lo: number, hi: number) => {
      const n = Number(str(fd, k));
      if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`${k}: use a whole number from ${lo} to ${hi}.`);
      return n;
    };
    const threshold = Number(str(fd, 'autoCommitThreshold'));
    if (!(threshold > 0 && threshold <= 100)) throw new Error('Auto-commit threshold: use a percentage between 1 and 100.');
    const values: Record<string, Prisma.InputJsonValue | null> = {
      companyName: str(fd, 'companyName').slice(0, 80) || 'Company',
      asOfDate: asOf || null,
      fyStartMonth: int('fyStartMonth', 1, 12),
      recurringThreshold: int('recurringThreshold', 1, 12),
      baselineMonths: int('baselineMonths', 1, 12),
      graceDays: int('graceDays', 0, 365),
      autoCommitThreshold: threshold / 100,
      syncIntervalMinutes: int('syncIntervalMinutes', 5, 1440),
      syncEnabled: str(fd, 'syncEnabled') === 'on',
      domainAlertDays: int('domainAlertDays', 1, 365),
    };
    for (const [key, value] of Object.entries(values))
      await prisma.setting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue, updatedById: user.userId }, update: { value: value as Prisma.InputJsonValue, updatedById: user.userId } });
    await audit({ action: 'settings.general', userId: user.userId, details: values as Prisma.InputJsonValue, ...meta });
    return done();
  });
}

export async function saveCategories(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const { user, meta } = await admin();
    const cats = await prisma.category.findMany();
    for (const c of cats) {
      const type = str(fd, `type:${c.id}`);
      const description = str(fd, `desc:${c.id}`);
      if (type && !TYPES.includes(type)) throw new Error('Unknown expense type.');
      if (type !== c.expenseType || description !== (c.description ?? '')) await prisma.category.update({ where: { id: c.id }, data: { expenseType: type || c.expenseType, description: description || null } });
    }
    const newName = str(fd, 'newName');
    if (newName) {
      const type = str(fd, 'newType');
      if (!TYPES.includes(type)) throw new Error('Choose a type for the new category.');
      await prisma.category.create({ data: { name: newName.slice(0, 120), expenseType: type, sortOrder: cats.length, colorIndex: cats.length } });
    }
    await audit({ action: 'settings.categories', userId: user.userId, details: { added: newName || null }, ...meta });
    return done('Categories saved. Types apply to all past and future rows.');
  });
}

export async function saveMappings(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const { user, meta } = await admin();
    const maps = await prisma.categoryMapping.findMany();
    const names = new Set((await prisma.category.findMany()).map((c) => c.name));
    for (const m of maps) {
      const v = str(fd, `map:${m.id}`);
      if (v === '__delete') await prisma.categoryMapping.delete({ where: { id: m.id } });
      else if (v && v !== m.category) {
        if (!names.has(v)) throw new Error(`“${v}” is not a category.`);
        await prisma.categoryMapping.update({ where: { id: m.id }, data: { category: v } });
      }
    }
    const label = str(fd, 'newLabel');
    if (label) {
      const cat = str(fd, 'newCategory');
      if (!names.has(cat)) throw new Error('Choose the category for the new mapping.');
      await prisma.categoryMapping.upsert({ where: { sourceLabel: label }, create: { sourceLabel: label.slice(0, 120), category: cat }, update: { category: cat } });
    }
    await audit({ action: 'settings.mappings', userId: user.userId, details: { added: label || null }, ...meta });
    return done('Mappings saved and applied to every row, past and future.');
  });
}

export async function saveBudgets(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const { user, meta } = await admin();
    const depts = await prisma.department.findMany();
    for (const d of depts) {
      const amount = money(fd, `budget:${d.name}`);
      await prisma.budget.upsert({ where: { department: d.name }, create: { department: d.name, monthlyAmount: amount, source: 'Edited in Settings' }, update: { monthlyAmount: amount, source: 'Edited in Settings' } });
    }
    await audit({ action: 'settings.budgets', userId: user.userId, ...meta });
    return done();
  });
}

export async function saveFx(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const { user, meta } = await admin();
    const rates = await prisma.fxRate.findMany();
    for (const r of rates) {
      if (r.code === 'USD') continue;
      const raw = str(fd, `fx:${r.code}`);
      if (raw && !(/^\d+(\.\d+)?$/.test(raw) && Number(raw) > 0)) throw new Error(`${r.code}: enter units per 1 USD (e.g. 56.2), or leave blank.`);
      await prisma.fxRate.update({ where: { code: r.code }, data: { unitsPerUsd: raw || null } });
    }
    const code = str(fd, 'newCode').toUpperCase();
    if (code) {
      if (!/^[A-Z]{3}$/.test(code)) throw new Error('Currency codes have 3 letters.');
      const raw = str(fd, 'newRate');
      await prisma.fxRate.upsert({ where: { code }, create: { code, unitsPerUsd: raw || null }, update: { unitsPerUsd: raw || null } });
    }
    await audit({ action: 'settings.fx', userId: user.userId, ...meta });
    return done('Rates saved. Non-USD rows without a rate stay flagged and excluded.');
  });
}

export async function deleteProfile(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const { user, meta } = await admin();
    const p = await prisma.layoutProfile.delete({ where: { id: str(fd, 'id') } });
    await audit({ action: 'layout.deleted', userId: user.userId, target: p.name, ...meta });
    return done('Layout removed. The next upload of that tab will ask for a mapping again.');
  });
}

export async function addSheetSource(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const { user, meta } = await admin();
    const sheetId = parseSheetId(str(fd, 'sheet'));
    if (!sheetId) throw new Error('Paste the Google Sheet link or its ID.');
    const year = str(fd, 'year') ? Number(str(fd, 'year')) : null;
    if (year !== null && !(year >= 2000 && year <= 2100)) throw new Error('Year must be like 2027.');
    await prisma.googleSheetSource.upsert({
      where: { sheetId },
      create: { sheetId, label: str(fd, 'label').slice(0, 80) || 'Expense sheet', year, enabled: true },
      update: { label: str(fd, 'label').slice(0, 80) || 'Expense sheet', year, enabled: true },
    });
    await audit({ action: 'settings.google_source_added', userId: user.userId, target: sheetId, details: { year }, ...meta });
    return done('Sheet added. It syncs on the next interval, or use “Sync now” on the Upload page.');
  });
}

export async function updateSheetSource(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const { user, meta } = await admin();
    const id = str(fd, 'id');
    if (str(fd, 'remove') === '1') {
      await prisma.googleSheetSource.delete({ where: { id } });
      await audit({ action: 'settings.google_source_removed', userId: user.userId, target: id, ...meta });
      return done('Sheet removed from sync. Its imported data stays.');
    }
    const s = await prisma.googleSheetSource.update({ where: { id }, data: { enabled: str(fd, 'enabled') === 'on' } });
    await audit({ action: 'settings.google_source_toggled', userId: user.userId, target: s.sheetId, details: { enabled: s.enabled }, ...meta });
    return done(s.enabled ? 'Sync on.' : 'Sync paused.');
  });
}

/** First-time setup on a server: load the confidential build kit from its .zip (reference data + the original workbook). */
export async function setupFromKitAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const { user, meta } = await admin();
    const file = fd.get('kit');
    if (!(file instanceof File) || !/\.zip$/i.test(file.name)) throw new Error('Choose the build kit .zip file.');
    if (file.size > 25 * 1024 * 1024) throw new Error('That zip is larger than 25 MB.');
    const { kitFromZip } = await import('@/lib/seed/kit');
    const { seedAll } = await import('@/lib/seed/seed');
    const kit = await kitFromZip(new Uint8Array(await file.arrayBuffer()));
    const report = await seedAll(prisma, kit);
    await audit({ action: 'setup.kit_loaded', userId: user.userId, target: file.name, details: { ...report, imported: report.imported ? { ...report.imported } : null }, ...meta });
    return done(
      `Loaded ${report.categories} categories, ${report.mappings} mappings, ${report.profiles} layouts, ${report.checks} reconciliation checks and ${report.issues} issues. ` +
        (report.imported ? `Imported the original workbook: ${report.imported.added} rows.` : 'Data was already imported, so the workbook was not imported again.'),
    );
  });
}
