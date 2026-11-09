// Import batches: preview (analyse + diff), commit (versioned upsert in one transaction), rollback, discard.
// Upload, Google sync, manual entry and the seed all go through these functions.
import crypto from 'node:crypto';
import type { BatchOrigin, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { readBook } from '@/lib/importer/workbook';
import { analyzeBook, type AnalysisResult } from '@/lib/importer/analyze';
import { computeDiff, expenseChanged, factChanged, inScope, type DiffResult } from '@/lib/importer/diff';
import type { AnalyzeOptions, PlanExpense, PlanFact, Profile, Scope } from '@/lib/importer/types';
import { financeSettings, loadAppSettings, loadCurrentExpenses, loadProfiles, loadRefData, versionToFact } from './data';
import { audit } from '@/lib/security/audit';

export interface StoredPlan {
  analysis: Omit<AnalysisResult, 'expenses' | 'facts'> & { expenses: PlanExpense[]; facts: PlanFact[] };
  removeKeys?: string[];
}

export interface BatchSummary {
  diff: Omit<DiffResult, 'rows'> & { rows: DiffResult['rows'] };
  errors: number;
  warnings: number;
  needsMapping: number;
  tabs: AnalysisResult['tabs'];
}

const MAX_DIFF_ROWS = 2000;

async function currentFactsInScopes(scopes: Scope[], client: Prisma.TransactionClient = prisma) {
  const factScopes = scopes.filter((s) => s.kind === 'fact');
  if (!factScopes.length) return [];
  const rows = await client.factVersion.findMany({
    where: { supersededById: null, removed: false, OR: factScopes.map((s) => ({ key: { startsWith: s.prefix } })) },
  });
  return rows.filter((r) => inScope(r.key, scopes, 'fact'));
}

export async function diffForPlan(plan: { expenses: PlanExpense[]; facts: PlanFact[]; scopes: Scope[]; removeKeys?: string[] }): Promise<DiffResult> {
  const [currentExpenses, ref, app] = await Promise.all([loadCurrentExpenses(), loadRefData(), loadAppSettings()]);
  const planFactKeys = plan.facts.map((f) => f.key);
  const currentFacts = [
    ...(await currentFactsInScopes(plan.scopes)),
    ...(await prisma.factVersion.findMany({ where: { supersededById: null, removed: false, key: { in: planFactKeys } } })),
  ];
  const uniq = new Map(currentFacts.map((f) => [f.key, { key: f.key, data: f.data }]));
  return computeDiff({ plan, currentExpenses, currentFacts: [...uniq.values()], ref, settings: financeSettings(app) });
}

/** Analyse a file and store it as a PREVIEW batch (nothing changes until it is committed). */
export async function createPreview(args: {
  buffer: Buffer;
  fileName: string;
  origin: BatchOrigin;
  userId?: string | null;
  options?: AnalyzeOptions;
  googleSourceId?: string;
  mime?: string;
}): Promise<{ batchId: string; summary: BatchSummary }> {
  const sha256 = crypto.createHash('sha256').update(args.buffer).digest('hex');
  const file = await prisma.sourceFile.create({
    data: { filename: args.fileName.slice(0, 200), sha256, size: args.buffer.length, mime: args.mime, bytes: new Uint8Array(args.buffer), origin: args.origin, uploadedById: args.userId ?? null },
  });
  const batch = await prisma.importBatch.create({
    data: { status: 'PREVIEW', origin: args.origin, label: args.fileName.slice(0, 200), sourceFileId: file.id, createdById: args.userId ?? null, options: (args.options ?? {}) as Prisma.InputJsonValue, googleSourceId: args.googleSourceId },
  });
  const summary = await analyzeIntoBatch(batch.id);
  return { batchId: batch.id, summary };
}

/** (Re)run the analysis for a batch from its stored file: used after a mapping step or a year change. */
export async function analyzeIntoBatch(batchId: string): Promise<BatchSummary> {
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId }, include: { sourceFile: true } });
  if (!batch.sourceFile) throw new Error('Batch has no source file.');
  if (batch.status !== 'PREVIEW' && batch.status !== 'HELD') throw new Error('Only a pending batch can be re-analysed.');
  const [profiles, ref] = await Promise.all([loadProfiles(), loadRefData()]);
  const book = readBook(Buffer.from(batch.sourceFile.bytes), batch.sourceFile.filename);
  const analysis = analyzeBook(book, batch.sourceFile.filename, { profiles, departments: ref.departments }, (batch.options ?? {}) as AnalyzeOptions);
  // A newly recognised Expense Entry list gets a saved profile straight away (no questions needed for that format).
  for (const p of analysis.newProfiles) await upsertProfile(p, batch.createdById);
  const diff = await diffForPlan({ expenses: analysis.expenses, facts: analysis.facts, scopes: analysis.scopes });
  const summary: BatchSummary = {
    diff: { ...diff, rows: diff.rows.slice(0, MAX_DIFF_ROWS) },
    errors: analysis.issues.filter((i) => i.level === 'error').length,
    warnings: analysis.issues.filter((i) => i.level === 'warning').length,
    needsMapping: analysis.mappings.length,
    tabs: analysis.tabs,
  };
  const plan: StoredPlan = { analysis };
  await prisma.importBatch.update({ where: { id: batchId }, data: { plan: plan as unknown as Prisma.InputJsonValue, summary: summary as unknown as Prisma.InputJsonValue } });
  return summary;
}

export async function upsertProfile(p: Profile, userId?: string | null) {
  await prisma.layoutProfile.upsert({
    where: { tabName_signature: { tabName: p.tabName, signature: p.signature } },
    create: { id: p.id, name: p.name, tabName: p.tabName, signature: p.signature, kind: p.kind, config: p.config as unknown as Prisma.InputJsonValue, builtin: p.builtin, createdById: userId ?? null },
    update: { name: p.name, kind: p.kind, config: p.config as unknown as Prisma.InputJsonValue },
  });
}

type Tx = Prisma.TransactionClient;

function expenseData(p: PlanExpense, batchId: string, userId?: string | null): Prisma.ExpenseVersionCreateManyInput {
  return {
    key: p.key,
    batchId,
    kind: p.kind,
    profileId: p.profileId,
    lineKey: p.lineKey,
    month: p.month ? new Date(`${p.month}-01T00:00:00Z`) : null,
    txnDate: p.txnDate ? new Date(`${p.txnDate}T00:00:00Z`) : null,
    department: p.department,
    sourceCategory: p.sourceCategory,
    categoryOverride: p.categoryOverride,
    item: p.item,
    description: p.description,
    vendor: p.vendor,
    vendorOverride: p.vendorOverride,
    amount: p.amount,
    currency: p.currency,
    rawValue: p.rawValue,
    recordType: p.recordType,
    countRole: p.countRole,
    countGroup: p.countGroup,
    isTrigger: p.isTrigger,
    recurringOverride: p.recurringOverride,
    paymentMethod: p.paymentMethod,
    reference: p.reference,
    notes: p.notes,
    sourceFile: p.sourceFile,
    sheet: p.sheet,
    cell: p.cell,
    rowNumber: p.rowNumber,
    displayId: p.displayId,
    createdById: userId ?? null,
  };
}

/**
 * Applies a plan as one batch inside a transaction: new/changed rows get a new version, the old version is marked
 * superseded; lines missing from a re-uploaded scope get a "removed" version (soft delete). Unchanged rows are untouched,
 * so importing the same file twice changes nothing.
 */
export async function applyPlan(
  tx: Tx,
  batchId: string,
  plan: { expenses: PlanExpense[]; facts: PlanFact[]; scopes: Scope[]; removeKeys?: string[] },
  userId?: string | null,
) {
  const current = await tx.expenseVersion.findMany({ where: { supersededById: null, removed: false } });
  const curByKey = new Map(current.map((c) => [c.key, c]));
  const planKeys = new Set(plan.expenses.map((e) => e.key));
  const inserts: Prisma.ExpenseVersionCreateManyInput[] = [];
  const supersede: string[] = [];
  let added = 0;
  let changed = 0;
  let removed = 0;
  for (const p of plan.expenses) {
    const c = curByKey.get(p.key);
    if (!c) {
      inserts.push(expenseData(p, batchId, userId));
      added++;
    } else if (expenseChanged(p, versionToFact(c) as unknown as Partial<PlanExpense>).length) {
      supersede.push(c.id);
      inserts.push(expenseData(p, batchId, userId));
      changed++;
    }
  }
  const removeKeys = new Set(plan.removeKeys ?? []);
  for (const c of current) {
    if (planKeys.has(c.key)) continue;
    if (!removeKeys.has(c.key) && !inScope(c.key, plan.scopes, 'expense')) continue;
    supersede.push(c.id);
    // Tombstone keeps the last known values for traceability.
    const { id: _id, batchId: _b, supersededById: _s, createdAt: _c, removed: _r, ...rest } = c;
    void _id; void _b; void _s; void _c; void _r;
    inserts.push({ ...rest, batchId, removed: true, createdById: userId ?? null } as Prisma.ExpenseVersionCreateManyInput);
    removed++;
  }
  if (supersede.length) await tx.expenseVersion.updateMany({ where: { id: { in: supersede } }, data: { supersededById: batchId } });
  for (let i = 0; i < inserts.length; i += 500) await tx.expenseVersion.createMany({ data: inserts.slice(i, i + 500) });

  // Facts.
  const factKeys = plan.facts.map((f) => f.key);
  const curFacts = await tx.factVersion.findMany({ where: { supersededById: null, removed: false, OR: [{ key: { in: factKeys } }, ...plan.scopes.filter((s) => s.kind === 'fact').map((s) => ({ key: { startsWith: s.prefix } }))] } });
  const curFactByKey = new Map(curFacts.map((f) => [f.key, f]));
  const factInserts: Prisma.FactVersionCreateManyInput[] = [];
  const factSupersede: string[] = [];
  let factsChanged = 0;
  const planFactKeys = new Set(factKeys);
  for (const f of plan.facts) {
    const c = curFactByKey.get(f.key);
    if (c && !factChanged(f, c.data)) continue;
    if (c) factSupersede.push(c.id);
    factInserts.push({ type: f.type, key: f.key, batchId, data: f.data as Prisma.InputJsonValue });
    factsChanged++;
  }
  for (const c of curFacts) {
    if (planFactKeys.has(c.key) || !inScope(c.key, plan.scopes, 'fact')) continue;
    factSupersede.push(c.id);
    factInserts.push({ type: c.type, key: c.key, batchId, data: c.data as Prisma.InputJsonValue, removed: true });
    factsChanged++;
  }
  if (factSupersede.length) await tx.factVersion.updateMany({ where: { id: { in: factSupersede } }, data: { supersededById: batchId } });
  for (let i = 0; i < factInserts.length; i += 200) await tx.factVersion.createMany({ data: factInserts.slice(i, i + 200) });

  // Statuses carried on uploaded transaction lists seed PaymentStatus only where the app has none yet (in-app edits win).
  for (const p of plan.expenses) {
    if (!p.initialStatus && !p.initialDueDate) continue;
    const exists = await tx.paymentStatus.findUnique({ where: { key: p.key } });
    if (exists) continue;
    await tx.paymentStatus.create({
      data: { key: p.key, status: p.initialStatus ?? 'Not recorded', dueDate: p.initialDueDate ? new Date(`${p.initialDueDate}T00:00:00Z`) : null, updatedById: userId ?? null },
    });
  }
  return { added, changed, removed, factsChanged };
}

export class BatchError extends Error {}

export async function commitBatch(batchId: string, userId: string | null, meta?: { ip?: string; userAgent?: string; allowErrors?: boolean }) {
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  if (batch.status !== 'PREVIEW' && batch.status !== 'HELD') throw new BatchError(`This batch is already ${batch.status.toLowerCase().replace('_', ' ')}.`);
  const plan = batch.plan as unknown as StoredPlan | null;
  if (!plan) throw new BatchError('Nothing to commit.');
  if (plan.analysis.mappings.length) throw new BatchError('Some tabs still need a mapping step before this file can be imported.');
  if (!meta?.allowErrors && plan.analysis.issues.some((i) => i.level === 'error')) throw new BatchError('Fix the validation errors (or confirm to import anyway) before committing.');
  const result = await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.importBatch.updateMany({ where: { id: batchId, status: { in: ['PREVIEW', 'HELD'] } }, data: { status: 'COMMITTED', committedAt: new Date(), committedById: userId } });
      if (claimed.count !== 1) throw new BatchError('This batch was committed or discarded by someone else.');
      const r = await applyPlan(tx, batchId, { ...plan.analysis, removeKeys: plan.removeKeys }, userId);
      const summary = (batch.summary ?? {}) as Record<string, unknown>;
      await tx.importBatch.update({ where: { id: batchId }, data: { summary: { ...summary, applied: r } as Prisma.InputJsonValue } });
      return r;
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
  await audit({ action: 'import.commit', userId, target: batch.label, details: { batchId, origin: batch.origin, ...result }, ip: meta?.ip, userAgent: meta?.userAgent });
  return result;
}

export async function rollbackBatch(batchId: string, userId: string | null, meta?: { ip?: string; userAgent?: string }) {
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  if (batch.status !== 'COMMITTED') throw new BatchError('Only a committed batch can be rolled back.');
  await prisma.$transaction(
    async (tx) => {
      const laterExp = await tx.expenseVersion.findFirst({ where: { batchId, supersededById: { not: null } }, select: { supersededById: true } });
      const laterFact = await tx.factVersion.findFirst({ where: { batchId, supersededById: { not: null } }, select: { supersededById: true } });
      const later = laterExp?.supersededById ?? laterFact?.supersededById;
      if (later) {
        const lb = await tx.importBatch.findUnique({ where: { id: later } });
        throw new BatchError(`A later batch (${lb?.label ?? later}, ${lb?.committedAt?.toISOString().slice(0, 16).replace('T', ' ')}) changed the same rows. Roll that back first.`);
      }
      await tx.expenseVersion.deleteMany({ where: { batchId } });
      await tx.factVersion.deleteMany({ where: { batchId } });
      await tx.expenseVersion.updateMany({ where: { supersededById: batchId }, data: { supersededById: null } });
      await tx.factVersion.updateMany({ where: { supersededById: batchId }, data: { supersededById: null } });
      await tx.importBatch.update({ where: { id: batchId }, data: { status: 'ROLLED_BACK', rolledBackAt: new Date(), rolledBackById: userId } });
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
  await audit({ action: 'import.rollback', userId, target: batch.label, details: { batchId }, ip: meta?.ip, userAgent: meta?.userAgent });
}

export async function discardBatch(batchId: string, userId: string | null) {
  await prisma.importBatch.updateMany({ where: { id: batchId, status: { in: ['PREVIEW', 'HELD'] } }, data: { status: 'DISCARDED', plan: undefined } });
  await audit({ action: 'import.discard', userId, details: { batchId } });
}

/** Small committed batch for in-app edits (manual entries), so they are versioned and can be rolled back too. */
export async function commitManual(label: string, plan: { expenses: PlanExpense[]; removeKeys?: string[] }, userId: string, meta?: { ip?: string; userAgent?: string }) {
  const batch = await prisma.importBatch.create({ data: { status: 'COMMITTED', origin: 'MANUAL', label, createdById: userId, committedById: userId, committedAt: new Date() } });
  const r = await prisma.$transaction((tx) => applyPlan(tx, batch.id, { expenses: plan.expenses, facts: [], scopes: [], removeKeys: plan.removeKeys }, userId));
  await prisma.importBatch.update({ where: { id: batch.id }, data: { summary: { applied: r } as Prisma.InputJsonValue } });
  await audit({ action: 'manual.' + (plan.removeKeys?.length ? 'delete' : 'save'), userId, target: label, details: { batchId: batch.id, ...r }, ip: meta?.ip, userAgent: meta?.userAgent });
  return { batchId: batch.id, ...r };
}

/** Saves the mapping step for one block as a layout profile, so the next upload of the same tab imports with no questions. */
export async function saveMapping(args: { tab: string; signature: string; config: import('@/lib/importer/types').GridConfig; userId: string | null }) {
  const { profileIdFor } = await import('@/lib/importer/detect');
  const name = `${args.tab} · ${args.config.title || 'grid'}${args.config.skip ? ' (not imported)' : ''}`;
  await upsertProfile({ id: profileIdFor(args.tab, args.signature), name, tabName: args.tab, signature: args.signature, kind: 'GRID', config: args.config, builtin: false }, args.userId);
  await audit({ action: 'layout.saved', userId: args.userId, target: name, details: { tab: args.tab, signature: args.signature, skip: !!args.config.skip } });
}
