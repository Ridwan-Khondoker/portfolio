import type { Decimal } from '@/lib/money';
import type { CountRole, ExpenseKind } from '@/lib/importer/types';

export type ExpenseType = 'Fixed' | 'Variable' | 'Non-operating' | 'Unclassified';
export type PayStatus = 'Paid' | 'Pending' | 'Overdue' | 'Not recorded';
export const PAY_STATUSES: PayStatus[] = ['Paid', 'Pending', 'Overdue', 'Not recorded'];
export const SETTABLE_STATUSES: PayStatus[] = ['Paid', 'Pending', 'Overdue', 'Not recorded'];

export const OTHER_CATEGORY = 'Other / Uncategorized';
export const SHARED_DEPARTMENT = 'Shared / Unassigned';

/** Current (latest committed, not removed) expense fact, as loaded from the database. */
export interface ExpenseFact {
  id: string;
  key: string;
  kind: ExpenseKind;
  batchId: string;
  lineKey: string | null;
  month: string | null;
  txnDate: string | null;
  department: string | null;
  sourceCategory: string | null;
  categoryOverride: string | null;
  item: string | null;
  description: string | null;
  vendor: string | null;
  amount: string | null;
  currency: string | null;
  rawValue: string | null;
  recordType: string;
  countRole: CountRole;
  countGroup: string | null;
  isTrigger: boolean;
  recurringOverride: string | null;
  paymentMethod: string | null;
  reference: string | null;
  notes: string | null;
  sourceFile: string | null;
  sheet: string | null;
  cell: string | null;
  displayId: string | null;
}

export interface StoredStatus {
  status: string;
  dueDate: string | null;
  note: string | null;
}

export interface RefData {
  departments: string[];
  categories: { name: string; expenseType: string }[];
  mappings: { sourceLabel: string; category: string }[];
  fx: { code: string; unitsPerUsd: string | null }[];
}

export interface Settings {
  asOf: string; // YYYY-MM-DD
  fyStartMonth: number;
  recurringThreshold: number;
  baselineMonths: number;
  graceDays: number;
}

export interface DerivedExpense extends ExpenseFact {
  amountUsd: Decimal | null;
  category: string;
  expenseType: ExpenseType;
  counted: boolean;
  recurring: 'Recurring' | 'One-Time' | '';
  storedStatus: PayStatus;
  status: PayStatus;
  dueDate: string | null;
  flags: string[];
}

export interface RevenueFact {
  key: string;
  department: string;
  month: string;
  amount: string | null;
  recordType: string;
  cell: string;
}
