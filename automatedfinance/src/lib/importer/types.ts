// Shapes shared by the importer, the commit/rollback code and the finance module.

export type CountRole = 'ALWAYS' | 'ESTIMATE' | 'ACTUAL';
export type ExpenseKind = 'GRID' | 'SUMMARY' | 'TRANSACTION' | 'MANUAL';

/** Grid block (Category / Item / January..December). Rows are relative to the header row so inserted rows above don't break it. */
export interface GridConfig {
  kind: 'GRID';
  skip?: boolean; // block recognised but deliberately not imported (e.g. a summary block that duplicates another)
  skipReason?: string;
  department: string;
  year: number | null;
  recordType: string; // 'Recorded (source grid)' | 'Estimate (budget block)' | 'Actual' | 'Summary (no line detail)'
  countRole: CountRole;
  countGroup?: string; // estimate/actual pair share a group; the actual block's trigger lines decide which counts each month
  triggerLines?: string[]; // line labels "Category|Item"
  title: string;
  catCol: string;
  itemCol: string;
  monthCols: string[];
  firstOffset: number;
  lastOffset: number;
  endMarker?: { label: string; offset: number };
  totalRowOffset?: number;
  categoryOverride?: string;
  categoryOverridesByLine?: Record<string, string>;
  vendorOverridesByLine?: Record<string, string>;
  notesByLine?: Record<string, string>;
  idPrefix?: string;
}

export interface PlRow {
  row: number;
  label: string;
  department: string;
}

/** P&L tab: monthly totals per business (summary expenses, optional) and revenue rows. */
export interface PlConfig {
  kind: 'PL';
  monthCols: string[];
  labelCol: string;
  expenseRows: PlRow[];
  revenueRows: PlRow[];
  expenseCategory: string;
  expenseRecordType: string;
  revenueRecordType: string;
  idPrefix?: string;
}

export interface RecurringConfig {
  kind: 'RECURRING';
  nameCol: string;
  detailCols: string[];
  amountCol: string;
  noteCols: string[];
  firstRow: number;
  domains?: { domainCol: string; priceCol: string; renewalCol: string; noteCol: string; firstRow: number };
}

export interface SnapshotConfig {
  kind: 'SNAPSHOT';
  nameCol: string;
  detailCol: string;
  semiMonthlyCol?: string;
  monthlyCol: string;
  semiAnnualCol?: string;
  annualCol?: string;
  paymentCol?: string;
  chargeDateCol?: string;
  firstRow: number;
}

export interface TransactionsConfig {
  kind: 'TRANSACTIONS';
  headerRow: number;
  columns: Partial<Record<TxnField, string>>;
}

export interface IgnoreConfig {
  kind: 'IGNORE';
  reason: string;
}

export type ProfileConfig = GridConfig | PlConfig | RecurringConfig | SnapshotConfig | TransactionsConfig | IgnoreConfig;

export interface Profile {
  id: string;
  name: string;
  tabName: string;
  signature: string;
  kind: ProfileConfig['kind'];
  config: ProfileConfig;
  builtin: boolean;
}

export const TXN_FIELDS = [
  'transactionDate',
  'department',
  'category',
  'description',
  'vendor',
  'paymentMethod',
  'amount',
  'currency',
  'paymentStatus',
  'dueDate',
  'recurring',
  'reference',
  'notes',
] as const;
export type TxnField = (typeof TXN_FIELDS)[number];

export const TXN_HEADERS: Record<TxnField, string> = {
  transactionDate: 'Transaction Date',
  department: 'Department / Project',
  category: 'Expense Category',
  description: 'Expense Description',
  vendor: 'Vendor / Payee',
  paymentMethod: 'Payment Method',
  amount: 'Amount',
  currency: 'Currency',
  paymentStatus: 'Payment Status',
  dueDate: 'Due Date',
  recurring: 'Recurring / One-Time',
  reference: 'Reference / Invoice #',
  notes: 'Notes',
};

/** One normalised expense fact as written to ExpenseVersion. Amount is a decimal string in `currency`. */
export interface PlanExpense {
  key: string;
  kind: ExpenseKind;
  profileId: string | null;
  lineKey: string | null;
  month: string | null; // YYYY-MM
  txnDate: string | null; // YYYY-MM-DD
  department: string | null;
  sourceCategory: string | null;
  categoryOverride: string | null;
  item: string | null;
  description: string | null;
  vendor: string | null;
  vendorOverride: string | null;
  amount: string | null;
  currency: string;
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
  rowNumber: number | null;
  displayId: string | null;
  // carried from transaction lists into PaymentStatus when no status has been set in the app yet
  initialStatus?: string | null;
  initialDueDate?: string | null;
}

export type FactType = 'REVENUE' | 'RECURRING' | 'DOMAIN' | 'SNAPSHOT_ITEM' | 'SHEET';

export interface PlanFact {
  type: FactType;
  key: string;
  data: Record<string, unknown>;
}

export interface Scope {
  kind: 'expense' | 'fact';
  prefix: string; // every current key starting with this prefix that is not in the plan is marked removed
  label: string;
}

export type TabStatus = 'imported' | 'needs-mapping' | 'skipped' | 'error';

export interface BlockReport {
  title: string;
  headerRow: number;
  signature: string;
  status: TabStatus;
  profileId?: string;
  profileName?: string;
  reason?: string;
  rows?: number;
}

export interface TabReport {
  tab: string;
  status: TabStatus;
  kind?: string;
  year?: number | null;
  reason?: string;
  expenses: number;
  facts: number;
  blocks: BlockReport[];
}

export interface MappingRequest {
  tab: string;
  signature: string;
  headerRow: number;
  title: string;
  catCol: string;
  itemCol: string;
  monthCols: string[];
  suggestion: GridConfig;
  suggestionSource: string | null; // name of the profile the suggestion was copied from
  rows: { row: number; category: string; item: string; sample: string }[];
}

export interface Issue {
  level: 'error' | 'warning';
  tab?: string;
  cell?: string;
  message: string;
}

export interface Analysis {
  fileName: string;
  tabs: TabReport[];
  mappings: MappingRequest[];
  expenses: PlanExpense[];
  facts: PlanFact[];
  scopes: Scope[];
  issues: Issue[];
}

export interface AnalyzeOptions {
  /** Year for business tabs whose name has no year (e.g. "HTD" in next year's copy). Default: the saved layout's year. */
  yearForUndatedTabs?: number | null;
}
