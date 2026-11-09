// In-app manual entries and payment statuses. Statuses live apart from imported facts, keyed to the stable key,
// so they survive re-imports.
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isYmd } from '@/lib/months';
import type { PlanExpense } from '@/lib/importer/types';
import { commitManual } from './imports';
import { audit } from '@/lib/security/audit';
import { PAY_STATUSES } from '@/lib/finance/types';

export const manualSchema = z.object({
  transactionDate: z.string().refine(isYmd, 'Use a valid date (YYYY-MM-DD).'),
  department: z.string().trim().min(1, 'Choose a department.').max(80),
  category: z.string().trim().min(1, 'Choose a category.').max(120),
  description: z.string().trim().min(1, 'Describe the expense.').max(300),
  vendor: z.string().trim().max(160).optional().default(''),
  paymentMethod: z.string().trim().max(120).optional().default(''),
  amount: z
    .string()
    .trim()
    .regex(/^-?\d{1,12}(\.\d{1,6})?$/, 'Enter an amount like 1250.00 (no currency symbol).'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code.')
    .default('USD'),
  paymentStatus: z.enum(PAY_STATUSES as [string, ...string[]]).default('Not recorded'),
  dueDate: z
    .string()
    .trim()
    .optional()
    .default('')
    .refine((v) => !v || isYmd(v), 'Use a valid due date.'),
  recurring: z.enum(['Recurring', 'One-Time']).default('One-Time'),
  reference: z.string().trim().max(120).optional().default(''),
  notes: z.string().trim().max(1000).optional().default(''),
});
export type ManualInput = z.infer<typeof manualSchema>;

function toPlan(key: string, input: ManualInput): PlanExpense {
  return {
    key,
    kind: 'MANUAL',
    profileId: null,
    lineKey: null,
    month: input.transactionDate.slice(0, 7),
    txnDate: input.transactionDate,
    department: input.department,
    sourceCategory: input.category,
    categoryOverride: null,
    item: input.vendor || null,
    description: input.description,
    vendor: input.vendor || `${input.category} - unspecified (${input.department})`,
    vendorOverride: null,
    amount: input.amount,
    currency: input.currency,
    rawValue: null,
    recordType: 'Manual entry',
    countRole: 'ALWAYS',
    countGroup: null,
    isTrigger: false,
    recurringOverride: input.recurring,
    paymentMethod: input.paymentMethod || null,
    reference: input.reference || null,
    notes: input.notes || null,
    sourceFile: null,
    sheet: null,
    cell: null,
    rowNumber: null,
    displayId: input.reference || `MAN-${key.slice(2, 10).toUpperCase()}`,
  };
}

/** Each manual entry gets its own key (not a content hash), so two identical entries stay separate and get flagged as duplicates. */
export async function saveManualEntry(input: ManualInput, userId: string, meta?: { ip?: string; userAgent?: string }, existingKey?: string) {
  const key = existingKey ?? `M:${crypto.randomUUID()}`;
  if (existingKey) {
    const cur = await prisma.expenseVersion.findFirst({ where: { key: existingKey, supersededById: null, removed: false } });
    if (!cur || cur.kind !== 'MANUAL') throw new Error('Only manual entries can be edited here; edit imported rows in their source sheet.');
  }
  const r = await commitManual(`Manual entry: ${input.description.slice(0, 60)}`, { expenses: [toPlan(key, input)] }, userId, meta);
  await setPaymentStatus(key, input.paymentStatus, input.dueDate || null, userId, null, meta);
  return { key, ...r };
}

export async function deleteManualEntry(key: string, userId: string, meta?: { ip?: string; userAgent?: string }) {
  const cur = await prisma.expenseVersion.findFirst({ where: { key, supersededById: null, removed: false } });
  if (!cur || cur.kind !== 'MANUAL') throw new Error('Only manual entries can be deleted here.');
  return commitManual(`Delete manual entry: ${(cur.description ?? '').slice(0, 60)}`, { expenses: [], removeKeys: [key] }, userId, meta);
}

export async function setPaymentStatus(key: string, status: string, dueDate: string | null, userId: string, note?: string | null, meta?: { ip?: string; userAgent?: string }) {
  if (!PAY_STATUSES.includes(status as never)) throw new Error('Unknown payment status.');
  if (dueDate && !isYmd(dueDate)) throw new Error('Use a valid due date.');
  const exists = await prisma.expenseVersion.findFirst({ where: { key, supersededById: null, removed: false }, select: { id: true } });
  if (!exists) throw new Error('That expense row no longer exists.');
  const before = await prisma.paymentStatus.findUnique({ where: { key } });
  await prisma.paymentStatus.upsert({
    where: { key },
    create: { key, status, dueDate: dueDate ? new Date(`${dueDate}T00:00:00Z`) : null, note: note ?? null, updatedById: userId },
    update: { status, dueDate: dueDate ? new Date(`${dueDate}T00:00:00Z`) : null, note: note ?? before?.note ?? null, updatedById: userId },
  });
  await audit({ action: 'status.set', userId, target: key, details: { from: before?.status ?? 'Not recorded', to: status, dueDate }, ip: meta?.ip, userAgent: meta?.userAgent });
}
