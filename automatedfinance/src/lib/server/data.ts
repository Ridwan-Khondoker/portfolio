// Loads the current state from the database into the plain shapes the pure finance module works on.
import { prisma } from '@/lib/db';
import type { ExpenseVersion, FactVersion, Prisma } from '@prisma/client';
import type { ExpenseFact, RefData, RevenueFact, Settings, StoredStatus } from '@/lib/finance/types';
import type { Profile } from '@/lib/importer/types';
import { todayYmd, isYmd } from '@/lib/months';

export const DEFAULT_SETTINGS = {
  companyName: 'TRIBE LLC',
  asOfDate: null as string | null,
  fyStartMonth: 1,
  recurringThreshold: 3,
  baselineMonths: 6,
  graceDays: 0,
  autoCommitThreshold: 0.25,
  syncIntervalMinutes: 15,
  syncEnabled: true,
  domainAlertDays: 60,
};
export type AppSettings = typeof DEFAULT_SETTINGS;

export async function loadAppSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) s[r.key] = r.value;
  return s as AppSettings;
}

export function financeSettings(app: AppSettings, overrideAsOf?: string | null): Settings {
  const asOf = overrideAsOf && isYmd(overrideAsOf) ? overrideAsOf : app.asOfDate && isYmd(app.asOfDate) ? app.asOfDate : todayYmd();
  return {
    asOf,
    fyStartMonth: Math.min(12, Math.max(1, Math.trunc(Number(app.fyStartMonth) || 1))),
    recurringThreshold: Math.max(1, Math.trunc(Number(app.recurringThreshold) || 3)),
    baselineMonths: Math.min(12, Math.max(1, Math.trunc(Number(app.baselineMonths) || 6))),
    graceDays: Math.max(0, Math.trunc(Number(app.graceDays) || 0)),
  };
}

export async function loadRefData(): Promise<RefData> {
  const [departments, categories, mappings, fx] = await Promise.all([
    prisma.department.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.categoryMapping.findMany(),
    prisma.fxRate.findMany(),
  ]);
  return {
    departments: departments.map((d) => d.name),
    categories: categories.map((c) => ({ name: c.name, expenseType: c.expenseType })),
    mappings: mappings.map((m) => ({ sourceLabel: m.sourceLabel, category: m.category })),
    fx: fx.map((f) => ({ code: f.code, unitsPerUsd: f.unitsPerUsd ? f.unitsPerUsd.toString() : null })),
  };
}

export async function loadProfiles(): Promise<Profile[]> {
  const rows = await prisma.layoutProfile.findMany({ orderBy: [{ tabName: 'asc' }, { name: 'asc' }] });
  return rows.map((r) => ({ id: r.id, name: r.name, tabName: r.tabName, signature: r.signature, kind: r.kind as Profile['kind'], config: r.config as unknown as Profile['config'], builtin: r.builtin }));
}

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function versionToFact(v: ExpenseVersion): ExpenseFact {
  return {
    id: v.id,
    key: v.key,
    kind: v.kind as ExpenseFact['kind'],
    batchId: v.batchId,
    lineKey: v.lineKey,
    month: v.month ? v.month.toISOString().slice(0, 7) : null,
    txnDate: ymd(v.txnDate),
    department: v.department,
    sourceCategory: v.sourceCategory,
    categoryOverride: v.categoryOverride,
    item: v.item,
    description: v.description,
    vendor: v.vendor,
    amount: v.amount ? v.amount.toString() : null,
    currency: v.currency,
    rawValue: v.rawValue,
    recordType: v.recordType,
    countRole: v.countRole as ExpenseFact['countRole'],
    countGroup: v.countGroup,
    isTrigger: v.isTrigger,
    recurringOverride: v.recurringOverride,
    paymentMethod: v.paymentMethod,
    reference: v.reference,
    notes: v.notes,
    sourceFile: v.sourceFile,
    sheet: v.sheet,
    cell: v.cell,
    displayId: v.displayId,
  };
}

export async function loadCurrentExpenses(client: Prisma.TransactionClient = prisma): Promise<ExpenseFact[]> {
  const rows = await client.expenseVersion.findMany({ where: { supersededById: null, removed: false }, orderBy: [{ month: 'asc' }, { key: 'asc' }] });
  return rows.map(versionToFact);
}

export async function loadStatuses(): Promise<Map<string, StoredStatus>> {
  const rows = await prisma.paymentStatus.findMany();
  return new Map(rows.map((r) => [r.key, { status: r.status, dueDate: ymd(r.dueDate), note: r.note }]));
}

export async function loadCurrentFacts(type: string, client: Prisma.TransactionClient = prisma): Promise<FactVersion[]> {
  return client.factVersion.findMany({ where: { type, supersededById: null, removed: false }, orderBy: { key: 'asc' } });
}

export async function loadRevenue(): Promise<RevenueFact[]> {
  const rows = await loadCurrentFacts('REVENUE');
  return rows.map((r) => {
    const d = r.data as Record<string, string | null>;
    return { key: r.key, department: d.department ?? '', month: d.month ?? '', amount: d.amount ?? null, recordType: d.recordType ?? '', cell: d.cell ?? '' };
  });
}

/** Latest committed import or sync, for the header. */
export async function lastImportInfo() {
  const [lastBatch, google] = await Promise.all([
    prisma.importBatch.findFirst({ where: { status: 'COMMITTED', origin: { in: ['UPLOAD', 'GOOGLE_SYNC', 'SEED'] } }, orderBy: { committedAt: 'desc' } }),
    prisma.googleSheetSource.findFirst({ where: { enabled: true }, orderBy: { lastSyncAt: 'desc' } }),
  ]);
  return {
    lastImportAt: lastBatch?.committedAt ?? null,
    lastImportLabel: lastBatch?.label ?? null,
    lastSyncAt: google?.lastSyncAt ?? null,
    lastSyncStatus: google?.lastStatus ?? null,
  };
}
