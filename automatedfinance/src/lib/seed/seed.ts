// Seeds reference data from the confidential kit, then imports the original workbook through the real importer.
import path from 'node:path';
import type { Prisma, PrismaClient } from '@prisma/client';
import { DEFAULT_SCENARIOS } from '@/lib/finance/projections';
import { checkFromRow } from '@/lib/finance/reconciliation';
import { normLabel } from '@/lib/finance/derive';
import { DEFAULT_SETTINGS } from '@/lib/server/data';
import { commitBatch, createPreview, upsertProfile } from '@/lib/server/imports';
import { kitDepartments, kitHints, kitProfiles, type Kit } from './kit';

export interface SeedReport {
  departments: number;
  categories: number;
  mappings: number;
  profiles: number;
  checks: number;
  issues: number;
  imported: null | { batchId: string; added: number; changed: number; removed: number };
}

export async function seedReferenceData(prisma: PrismaClient, kit: Kit): Promise<Omit<SeedReport, 'imported'>> {
  const departments = kitDepartments(kit);
  for (const [i, name] of departments.entries())
    await prisma.department.upsert({ where: { name }, create: { name, sortOrder: i, colorIndex: i }, update: { sortOrder: i } });

  for (const [i, c] of kit.categories.entries())
    await prisma.category.upsert({
      where: { name: c.category! },
      create: { name: c.category!, expenseType: c.expense_type!, description: c.description || null, sortOrder: i, colorIndex: i },
      update: {},
    });
  for (const m of kit.mappings)
    await prisma.categoryMapping.upsert({ where: { sourceLabel: m.source_label! }, create: { sourceLabel: m.source_label!, category: m.standard_category! }, update: {} });

  for (const b of kit.budgets)
    await prisma.budget.upsert({
      where: { department: b.department! },
      create: { department: b.department!, monthlyAmount: b.monthly_budget_usd || '0', source: b.source || null },
      update: {},
    });

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS))
    await prisma.setting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue }, update: {} });

  for (const [code, note] of [
    ['USD', 'Base currency'],
    ['PHP', 'Philippines team. Enter a rate before logging PHP amounts.'],
    ['BDT', 'Bangladesh team. Enter a rate before logging BDT amounts.'],
    ['COP', 'Colombia team. Enter a rate before logging COP amounts.'],
  ] as const)
    await prisma.fxRate.upsert({ where: { code }, create: { code, unitsPerUsd: code === 'USD' ? '1' : null, note }, update: {} });

  for (const s of DEFAULT_SCENARIOS)
    await prisma.scenario.upsert({ where: { key: s.key }, create: { ...s, growthOverBase: s.growthOverBase }, update: {} });
  for (let m = 1; m <= 12; m++) await prisma.seasonalityIndex.upsert({ where: { month: m }, create: { month: m, idx: '1' }, update: {} });

  for (const i of kit.issues)
    await prisma.issueLogItem.upsert({
      where: { n: Number(i.n) },
      create: { n: Number(i.n), sheetCell: i.sheet_cell!, issue: i.issue!, actionTaken: i.action_taken!, status: i.status! },
      update: { sheetCell: i.sheet_cell!, issue: i.issue!, actionTaken: i.action_taken!, status: i.status! },
    });

  const profiles = kitProfiles(kit);
  for (const p of profiles) await upsertProfile(p);

  // Reconciliation checks (structure parsed from the kit's expected tie-outs).
  const hints = kitHints(kit);
  const aliases: Record<string, string> = {};
  for (const [sheet, prefix] of Object.entries(hints.idPrefixBySheet ?? {})) aliases[prefix] = sheet;
  const sheetNames = kit.book.sheets.map((s) => s.name);
  const existing = await prisma.reconciliationCheck.count();
  let checks = existing;
  if (!existing) {
    for (const [i, row] of kit.reconciliation.entries()) {
      const def = checkFromRow(row as never, departments, aliases, sheetNames);
      await prisma.reconciliationCheck.create({
        data: {
          sortOrder: i,
          name: def.name,
          periodLabel: def.periodLabel,
          periodStart: new Date(`${def.periodStart}-01T00:00:00Z`),
          periodEnd: new Date(`${def.periodEnd}-01T00:00:00Z`),
          measure: def.measure,
          department: def.department,
          sourceRefs: def.sourceRefs as unknown as Prisma.InputJsonValue,
          sourceLabel: def.sourceLabel,
          explanation: def.explanation,
          explainedDifference: def.explainedDifference,
        },
      });
    }
    checks = kit.reconciliation.length;
  }

  // Recurring list metadata the sheet doesn't hold: department and the matching October snapshot line.
  const snapshotProfile = profiles.find((p) => p.kind === 'SNAPSHOT');
  const snapItems: { key: string; name: string; detail: string }[] = [];
  if (snapshotProfile) {
    const sheet = kit.book.sheets.find((s) => s.name === snapshotProfile.tabName);
    if (sheet) {
      const { analyzeBook } = await import('@/lib/importer/analyze');
      const a = analyzeBook({ sheets: [sheet] }, 'seed', { profiles: [snapshotProfile], departments });
      for (const f of a.facts.filter((x) => x.type === 'SNAPSHOT_ITEM')) {
        const d = f.data as { itemKey: string; name: string; detail: string };
        snapItems.push({ key: d.itemKey, name: d.name, detail: d.detail });
      }
    }
  }
  for (const r of kit.recurring) {
    if (!r.expense || /^sub\s*total$/i.test(r.expense)) continue;
    const itemKey = `${normLabel(r.expense)}|${normLabel(r.detail)}`;
    const match = (r.oct_snapshot_match_name ?? '').trim();
    let snapshotMatch: string | null = '';
    if (match) {
      const cands = snapItems.filter((s) => normLabel(s.name) === normLabel(match) || normLabel(s.detail ? `${s.name} (${s.detail})` : s.name) === normLabel(match));
      snapshotMatch = (cands.find((s) => normLabel(s.detail) === normLabel(r.detail)) ?? cands[0])?.key ?? null;
    }
    await prisma.recurringItemMeta.upsert({
      where: { itemKey },
      create: { itemKey, department: r.department || null, snapshotMatch },
      update: {},
    });
  }

  return { departments: departments.length, categories: kit.categories.length, mappings: kit.mappings.length, profiles: profiles.length, checks, issues: kit.issues.length };
}

/** Imports the original workbook through the same path as an upload, unless something has been imported already. */
export async function seedWorkbookImport(prisma: PrismaClient, kit: Kit, opts: { force?: boolean } = {}): Promise<SeedReport['imported']> {
  if (!opts.force) {
    const done = await prisma.importBatch.count({ where: { status: 'COMMITTED', origin: { in: ['SEED', 'UPLOAD', 'GOOGLE_SYNC'] } } });
    if (done) return null;
  }
  const { batchId } = await createPreview({ buffer: kit.workbook, fileName: path.basename(kit.workbookPath), origin: 'SEED' });
  const r = await commitBatch(batchId, null);
  return { batchId, added: r.added, changed: r.changed, removed: r.removed };
}

export async function seedAll(prisma: PrismaClient, kit: Kit, opts: { force?: boolean } = {}): Promise<SeedReport> {
  const ref = await seedReferenceData(prisma, kit);
  const imported = await seedWorkbookImport(prisma, kit, opts);
  return { ...ref, imported };
}
