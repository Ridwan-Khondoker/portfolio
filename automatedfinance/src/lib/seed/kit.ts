// Loads the confidential build kit (data/ and source-workbooks/) from local disk. Never bundled, never committed.
import fs from 'node:fs';
import path from 'node:path';
import { csvObjects } from '@/lib/csv';
import { readBook, type Book } from '@/lib/importer/workbook';
import { builtinProfiles, type BuiltinHints } from '@/lib/importer/builtin';
import type { Profile } from '@/lib/importer/types';

export interface Kit {
  dataDir: string;
  workbookPath: string;
  workbook: Buffer;
  book: Book;
  layouts: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  categories: Record<string, string>[];
  mappings: Record<string, string>[];
  budgets: Record<string, string>[];
  issues: Record<string, string>[];
  recurring: Record<string, string>[];
  domains: Record<string, string>[];
  revenue: Record<string, string>[];
  master: Record<string, string>[];
  reconciliation: Record<string, string>[];
  expected: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function kitPaths() {
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
  const workbookPath = path.resolve(process.env.WORKBOOK_PATH || path.join(process.cwd(), 'source-workbooks', 'ORIGINAL_Google_Sheet_export.xlsx'));
  return { dataDir, workbookPath };
}

export function kitAvailable(): boolean {
  const { dataDir, workbookPath } = kitPaths();
  return fs.existsSync(path.join(dataDir, 'source_layouts.json')) && fs.existsSync(workbookPath);
}

export const KIT_DATA_FILES = [
  'source_layouts.json',
  'categories.csv',
  'category_mapping.csv',
  'budgets.csv',
  'issues_log.csv',
  'recurring_expenses.csv',
  'domains.csv',
  'revenue.csv',
  'master_expenses.csv',
  'reconciliation_expected.csv',
  'expected_results.json',
];
export const KIT_WORKBOOK = 'ORIGINAL_Google_Sheet_export.xlsx';

export function loadKit(): Kit {
  const { dataDir, workbookPath } = kitPaths();
  return buildKit((f) => fs.readFileSync(path.join(dataDir, f), 'utf8'), fs.readFileSync(workbookPath), dataDir, workbookPath);
}

/** Same kit, from the build-kit .zip uploaded on the Settings page (nothing is written to disk). */
export async function kitFromZip(zip: Uint8Array): Promise<Kit> {
  const { unzipSync } = await import('fflate');
  const MAX_FILE = 40 * 1024 * 1024;
  const wanted = new Set([...KIT_DATA_FILES, KIT_WORKBOOK]);
  let total = 0;
  const files = unzipSync(zip, {
    filter: (f) => {
      const base = f.name.split('/').pop() ?? '';
      if (!wanted.has(base) || f.name.includes('..')) return false;
      total += f.originalSize;
      if (f.originalSize > MAX_FILE || total > 4 * MAX_FILE) throw new Error('The zip is larger than expected for the build kit.');
      return true;
    },
  });
  const byBase = new Map(Object.entries(files).map(([name, data]) => [name.split('/').pop()!, data]));
  const missing = [...wanted].filter((f) => !byBase.has(f));
  if (missing.length) throw new Error(`The zip is missing: ${missing.join(', ')}.`);
  const text = (f: string) => new TextDecoder().decode(byBase.get(f)!);
  return buildKit(text, Buffer.from(byBase.get(KIT_WORKBOOK)!), 'uploaded zip', KIT_WORKBOOK);
}

function buildKit(read: (f: string) => string, workbook: Buffer, dataDir: string, workbookPath: string): Kit {
  const csv = (f: string) => csvObjects(read(f));
  return {
    dataDir,
    workbookPath,
    workbook,
    book: readBook(workbook, path.basename(workbookPath)),
    layouts: JSON.parse(read('source_layouts.json')),
    categories: csv('categories.csv'),
    mappings: csv('category_mapping.csv'),
    budgets: csv('budgets.csv'),
    issues: csv('issues_log.csv'),
    recurring: csv('recurring_expenses.csv'),
    domains: csv('domains.csv'),
    revenue: csv('revenue.csv'),
    master: csv('master_expenses.csv'),
    reconciliation: csv('reconciliation_expected.csv'),
    expected: JSON.parse(read('expected_results.json')),
  };
}

/** Display-id prefixes and revenue labels, learned from the kit's own normalised exports. */
export function kitHints(kit: Kit): BuiltinHints {
  const idPrefixBySheet: Record<string, string> = {};
  for (const r of kit.master) {
    const prefix = r.transaction_id_reference?.split('-')[0];
    if (prefix && r.source_worksheet && !idPrefixBySheet[r.source_worksheet]) idPrefixBySheet[r.source_worksheet] = prefix;
  }
  const revenueRecordTypeBySheet: Record<string, string> = {};
  for (const r of kit.revenue) if (r.source_worksheet && r.record_type) revenueRecordTypeBySheet[r.source_worksheet] = r.record_type;
  return { idPrefixBySheet, revenueRecordTypeBySheet };
}

export function kitProfiles(kit: Kit): Profile[] {
  return builtinProfiles(kit.layouts, kit.book, kitHints(kit));
}

export function kitDepartments(kit: Kit): string[] {
  return kit.budgets.map((b) => b.department!).filter(Boolean);
}

export function kitRefData(kit: Kit) {
  return {
    departments: kitDepartments(kit),
    categories: kit.categories.map((c) => ({ name: c.category!, expenseType: c.expense_type! })),
    mappings: kit.mappings.map((m) => ({ sourceLabel: m.source_label!, category: m.standard_category! })),
    fx: [
      { code: 'USD', unitsPerUsd: '1' },
      { code: 'PHP', unitsPerUsd: null },
      { code: 'BDT', unitsPerUsd: null },
      { code: 'COP', unitsPerUsd: null },
    ],
  };
}
