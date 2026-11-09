// Filtering, search and sorting for the Transactions table and its CSV/XLSX export (same rows in both).
import { prisma } from '@/lib/db';
import type { DerivedExpense } from '@/lib/finance/types';
import type { Filters } from '@/lib/finance/dashboard';
import { firstDataMonth } from '@/lib/finance/dashboard';
import { loadState } from './state';
import { parseFilters, sp, type SearchParams } from './filters';

export type SortKey = 'month' | 'amount' | 'department' | 'category' | 'vendor' | 'status';

export interface TxnQuery {
  filters: Filters;
  q: string;
  sort: SortKey;
  dir: 'asc' | 'desc';
  includeUncounted: boolean;
  flaggedOnly: boolean;
}

export async function queryTransactions(params: SearchParams) {
  const state = await loadState();
  const current = state.settings.asOf.slice(0, 7);
  const categories = state.ref.categories.map((c) => c.name);
  const filters = parseFilters(params, { current, firstMonth: firstDataMonth(state.rows), departments: state.ref.departments, categories });
  const sortRaw = sp(params, 'sort') as SortKey | undefined;
  const query: TxnQuery = {
    filters,
    q: (sp(params, 'q') ?? '').trim().slice(0, 100),
    sort: sortRaw && ['month', 'amount', 'department', 'category', 'vendor', 'status'].includes(sortRaw) ? sortRaw : 'month',
    dir: sp(params, 'dir') === 'asc' ? 'asc' : 'desc',
    includeUncounted: sp(params, 'all') === '1',
    flaggedOnly: sp(params, 'flagged') === '1',
  };
  const f = query.filters;
  const needle = query.q.toLowerCase();
  let rows = state.rows.filter((r) => {
    if (!query.includeUncounted && !r.counted) return false;
    if (r.month && (r.month < f.start || r.month > f.end)) return false;
    if (!r.month && !query.includeUncounted && r.kind !== 'MANUAL') return false;
    if (f.department !== 'All' && r.department !== f.department) return false;
    if (f.category !== 'All' && r.category !== f.category) return false;
    if (f.status !== 'All' && r.status !== f.status) return false;
    if (query.flaggedOnly && !r.flags.length) return false;
    if (needle) {
      const hay = [r.description, r.vendor, r.category, r.department, r.cell, r.displayId, r.reference, r.notes, r.sourceCategory].join(' ').toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  const val = (r: DerivedExpense): string | number => {
    switch (query.sort) {
      case 'amount':
        return r.amountUsd ? r.amountUsd.toNumber() : -Infinity;
      case 'department':
        return r.department ?? '';
      case 'category':
        return r.category;
      case 'vendor':
        return r.vendor ?? '';
      case 'status':
        return r.status;
      default:
        return `${r.month ?? '0000-00'}|${r.txnDate ?? ''}`;
    }
  };
  rows = rows.sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    const tie = (b.amountUsd?.toNumber() ?? 0) - (a.amountUsd?.toNumber() ?? 0);
    return (query.dir === 'asc' ? c : -c) || tie;
  });
  const batchIds = [...new Set(rows.map((r) => r.batchId))];
  const batches = await prisma.importBatch.findMany({ where: { id: { in: batchIds } }, select: { id: true, label: true, origin: true, committedAt: true } });
  return { state, query, rows, batches: new Map(batches.map((b) => [b.id, b])), categories };
}

export function exportRows(rows: DerivedExpense[], batches: Map<string, { label: string; committedAt: Date | null }>): (string | number | null)[][] {
  const header = [
    'Transaction ID / Reference',
    'Transaction Date',
    'Month',
    'Department / Project',
    'Expense Category',
    'Expense Type',
    'Expense Description',
    'Vendor / Payee',
    'Amount (USD)',
    'Original Amount',
    'Currency',
    'Payment Method',
    'Payment Status (effective)',
    'Due Date',
    'Recurring / One-Time',
    'Record Type',
    'Counted in Totals',
    'Data Checks',
    'Source File',
    'Source Cell',
    'Import Batch',
    'Notes',
  ];
  return [
    header,
    ...rows.map((r) => [
      r.displayId ?? r.reference ?? '',
      r.txnDate,
      r.month,
      r.department,
      r.category,
      r.expenseType,
      r.description,
      r.vendor,
      r.amountUsd ? Number(r.amountUsd.toFixed(2)) : null,
      r.amount ?? r.rawValue,
      r.currency,
      r.paymentMethod,
      r.status,
      r.dueDate,
      r.recurring,
      r.recordType,
      r.counted ? 1 : 0,
      r.flags.join('; '),
      r.sourceFile,
      r.cell,
      batches.get(r.batchId)?.label ?? r.batchId,
      r.notes,
    ]),
  ];
}
