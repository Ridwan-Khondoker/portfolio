// The importer engine: workbook -> per-tab report + normalised plan (expenses, facts, removal scopes).
// Pure apart from reading the workbook; the caller supplies the saved layout profiles.
import crypto from 'node:crypto';
import { numToDecString } from '@/lib/money';
import { ymOf } from '@/lib/months';
import { cellToYmd, getCell, snapshotSheet, textOf, type Book, type Sheet } from './workbook';
import { baseTabName, findGridBlocks, findTransactionHeader, isSheetEmpty, norm, profileIdFor, transactionSignature, yearInName, type DetectedBlock } from './detect';
import type {
  Analysis,
  AnalyzeOptions,
  GridConfig,
  Issue,
  MappingRequest,
  PlConfig,
  PlanExpense,
  PlanFact,
  Profile,
  RecurringConfig,
  Scope,
  SnapshotConfig,
  TabReport,
  TransactionsConfig,
} from './types';

export interface AnalyzeContext {
  profiles: Profile[];
  departments: string[];
}

export interface AnalysisResult extends Analysis {
  /** Profiles created automatically (e.g. a new Expense Entry list); persisted with the preview batch. */
  newProfiles: Profile[];
}

const PAY_STATUSES = ['Paid', 'Pending', 'Overdue', 'Not recorded'];

export function analyzeBook(book: Book, fileName: string, ctx: AnalyzeContext, options: AnalyzeOptions = {}): AnalysisResult {
  const out: AnalysisResult = { fileName, tabs: [], mappings: [], expenses: [], facts: [], scopes: [], issues: [], newProfiles: [] };
  const byTab = new Map<string, Profile[]>();
  for (const p of ctx.profiles) byTab.set(p.tabName, [...(byTab.get(p.tabName) ?? []), p]);

  for (const sheet of book.sheets) {
    const report: TabReport = { tab: sheet.name, status: 'skipped', expenses: 0, facts: 0, blocks: [] };
    out.tabs.push(report);
    const profiles = byTab.get(sheet.name) ?? [];
    const before = { e: out.expenses.length, f: out.facts.length };

    const ignore = profiles.find((p) => p.kind === 'IGNORE');
    if (ignore && ignore.config.kind === 'IGNORE') {
      report.reason = ignore.config.reason;
      report.kind = 'Not imported';
      continue;
    }
    if (isSheetEmpty(sheet)) {
      report.reason = 'Empty tab';
      continue;
    }

    let handled = false;
    for (const p of profiles) {
      const cfg = p.config;
      if (cfg.kind === 'PL') {
        handled = extractPl(sheet, p, cfg, fileName, out, report) || handled;
      } else if (cfg.kind === 'RECURRING') {
        extractRecurring(sheet, p, cfg, out);
        report.kind = 'Recurring list';
        handled = true;
      } else if (cfg.kind === 'SNAPSHOT') {
        extractSnapshot(sheet, p, cfg, out);
        report.kind = 'Run-rate snapshot (not counted as expenses)';
        handled = true;
      } else if (cfg.kind === 'TRANSACTIONS') {
        const header = findTransactionHeader(sheet);
        if (header && transactionSignature(header.columns) === p.signature) {
          extractTransactions(sheet, p, { ...cfg, headerRow: header.headerRow }, fileName, ctx, out);
          report.kind = 'Transaction list';
          handled = true;
        }
      }
    }

    const gridProfiles = profiles.filter((p) => p.kind === 'GRID');
    const blocks = findGridBlocks(sheet);
    if (blocks.length && (gridProfiles.length || !handled)) {
      handled = true;
      report.kind = report.kind ?? 'Business tab (monthly grid)';
      for (const block of blocks) {
        const profile = gridProfiles.find((p) => p.signature === block.signature);
        if (!profile) {
          out.mappings.push(buildMappingRequest(sheet, block, ctx));
          report.blocks.push({ title: block.title, headerRow: block.headerRow, signature: block.signature, status: 'needs-mapping' });
          continue;
        }
        const cfg = profile.config as GridConfig;
        if (cfg.skip) {
          report.blocks.push({ title: block.title, headerRow: block.headerRow, signature: block.signature, status: 'skipped', profileId: profile.id, profileName: profile.name, reason: cfg.skipReason ?? 'Marked “do not import”' });
          continue;
        }
        const year = yearInName(sheet.name) ?? options.yearForUndatedTabs ?? cfg.year;
        if (!year) {
          out.issues.push({ level: 'error', tab: sheet.name, message: `No year for block “${block.title}”. Choose the year for this file.` });
          report.blocks.push({ title: block.title, headerRow: block.headerRow, signature: block.signature, status: 'error', reason: 'Year unknown' });
          continue;
        }
        report.year = year;
        const rows = extractGrid(sheet, block, profile, cfg, year, fileName, out);
        report.blocks.push({ title: block.title, headerRow: block.headerRow, signature: block.signature, status: 'imported', profileId: profile.id, profileName: profile.name, rows });
      }
      if (report.year) {
        const year = report.year;
        out.facts.push({ type: 'SHEET', key: `SHEET:${sheet.name}:${year}`, data: { sheet: sheet.name, year, ...snapshotSheet(sheet) } });
        out.scopes.push({ kind: 'fact', prefix: `SHEET:${sheet.name}:${year}`, label: `${sheet.name} ${year} (cell snapshot)` });
      }
    }

    if (!handled) {
      const header = findTransactionHeader(sheet);
      if (header) {
        const signature = transactionSignature(header.columns);
        const profile: Profile = {
          id: profileIdFor(sheet.name, signature),
          name: `${sheet.name} (transaction list)`,
          tabName: sheet.name,
          signature,
          kind: 'TRANSACTIONS',
          config: { kind: 'TRANSACTIONS', headerRow: header.headerRow, columns: header.columns },
          builtin: false,
        };
        out.newProfiles.push(profile);
        extractTransactions(sheet, profile, profile.config as TransactionsConfig, fileName, ctx, out);
        report.kind = 'Transaction list';
        handled = true;
      }
    }

    report.expenses = out.expenses.length - before.e;
    report.facts = out.facts.length - before.f;
    const blockStatuses = report.blocks.map((b) => b.status);
    if (blockStatuses.includes('error')) report.status = 'error';
    else if (blockStatuses.includes('needs-mapping')) report.status = 'needs-mapping';
    else if (handled && (report.expenses || report.facts || blockStatuses.includes('imported'))) report.status = 'imported';
    else if (handled) {
      report.status = 'skipped';
      report.reason = report.reason ?? (blockStatuses.length ? 'All blocks marked “do not import”' : 'No rows found');
    } else {
      report.status = 'skipped';
      report.reason = 'Not a recognised layout: no Category / Item / January–December header and no Expense Entry columns';
    }
  }
  return out;
}

// ------------------------------------------------------------------ grids

function lineLabel(cat: string, item: string): string {
  return `${cat}|${item}`;
}

function findEndMarker(sheet: Sheet, block: DetectedBlock, cfg: GridConfig): number | null {
  if (!cfg.endMarker) return null;
  const want = norm(cfg.endMarker.label);
  const limit = Math.min(sheet.maxRow, block.headerRow + cfg.endMarker.offset + 80);
  for (let r = block.headerRow + cfg.firstOffset; r <= limit; r++) {
    const a = norm(textOf(sheet, r, cfg.catCol));
    const b = norm(textOf(sheet, r, cfg.itemCol));
    if (a === want || b === want || norm(`${a} ${b}`) === want) return r;
  }
  return null;
}

function extractGrid(sheet: Sheet, block: DetectedBlock, profile: Profile, cfg: GridConfig, year: number, fileName: string, out: AnalysisResult): number {
  const first = block.headerRow + cfg.firstOffset;
  let last = block.headerRow + cfg.lastOffset;
  const marker = findEndMarker(sheet, block, cfg);
  if (cfg.endMarker) {
    if (marker === null) {
      out.issues.push({ level: 'warning', tab: sheet.name, message: `“${block.title}”: end-of-block row “${cfg.endMarker.label}” not found; used the saved row range.` });
    } else {
      const shift = marker - block.headerRow - cfg.endMarker.offset;
      if (shift !== 0) {
        last += shift;
        out.issues.push({ level: 'warning', tab: sheet.name, message: `“${block.title}” has ${Math.abs(shift)} ${shift > 0 ? 'more' : 'fewer'} row(s) than last time; imported rows ${first}–${last}.` });
      }
    }
  }
  const prefix = `G:${profile.id}:${year}-`;
  out.scopes.push({ kind: 'expense', prefix, label: `${profile.name} ${year}` });
  const countGroup = cfg.countGroup ? `${cfg.countGroup}:${year}` : null;
  const seen = new Map<string, number>();
  let rows = 0;
  for (let r = first; r <= last; r++) {
    const cat = textOf(sheet, r, cfg.catCol);
    const item = textOf(sheet, r, cfg.itemCol);
    const label = lineLabel(cat, item);
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    const lineKey = `${sheet.name}|${label}${n > 1 ? `#${n}` : ''}`;
    let any = false;
    cfg.monthCols.forEach((col, i) => {
      const cell = getCell(sheet, r, col);
      if (cell.kind === 'blank') return;
      if (cell.kind === 'number' && cell.num === 0) return;
      if (cell.kind === 'text' && !cell.text?.trim()) return;
      const ref = `${col}${r}`;
      let amount: string | null = null;
      let raw: string | null = null;
      if (cell.kind === 'number') amount = numToDecString(cell.num!);
      else {
        raw = (cell.text ?? '').trim() || '?';
        out.issues.push({
          level: cell.kind === 'error' ? 'error' : 'warning',
          tab: sheet.name,
          cell: ref,
          message: cell.kind === 'error' ? `Error value ${raw} in ${sheet.name}!${ref} was not imported as an amount.` : `Non-numeric amount “${raw}” in ${sheet.name}!${ref}.`,
        });
      }
      any = true;
      const month = ymOf(year, i + 1);
      const mm = String(i + 1).padStart(2, '0');
      const vendorOverride = cfg.vendorOverridesByLine?.[label] ?? (item.includes('???') ? `(unknown - listed as '${item}')` : null);
      out.expenses.push({
        key: `${prefix}${mm}:${lineKey}`,
        kind: cfg.recordType.startsWith('Summary') ? 'SUMMARY' : 'GRID',
        profileId: profile.id,
        lineKey: `${profile.id}:${lineKey}`,
        month,
        txnDate: `${month}-01`,
        department: cfg.department,
        sourceCategory: cat || null,
        categoryOverride: cfg.categoryOverridesByLine?.[label] ?? cfg.categoryOverride ?? null,
        item: item || null,
        description: cat && item ? `${cat} - ${item}` : cat || item || '(no description)',
        vendor: vendorOverride ?? (item || `${cat || 'Uncategorized'} - unspecified (${cfg.department})`),
        vendorOverride,
        amount,
        currency: 'USD',
        rawValue: raw,
        recordType: cfg.recordType,
        countRole: cfg.countRole,
        countGroup,
        isTrigger: cfg.countRole === 'ACTUAL' && !!cfg.triggerLines?.includes(label),
        recurringOverride: null,
        paymentMethod: null,
        reference: null,
        notes: cfg.notesByLine?.[label] ?? null,
        sourceFile: fileName,
        sheet: sheet.name,
        cell: `${sheet.name}!${ref}`,
        rowNumber: r,
        displayId: `${cfg.idPrefix ?? abbreviate(sheet.name)}-${year}-${mm}-R${r}`,
      });
    });
    if (any) rows++;
  }
  return rows;
}

export function abbreviate(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/);
  return (words.length > 1 ? words.map((w) => w[0]).join('') : name.slice(0, 4)).toUpperCase();
}

/** Defaults for a block seen for the first time: copy a same-named layout from another year when one exists. */
export function buildMappingRequest(sheet: Sheet, block: DetectedBlock, ctx: AnalyzeContext): MappingRequest {
  const base = norm(baseTabName(sheet.name));
  const template = ctx.profiles.find(
    (p) => p.kind === 'GRID' && norm(baseTabName(p.tabName)) === base && p.signature.replace(/#\d+$/, '') === block.signature.replace(/#\d+$/, ''),
  );
  let firstOffset = 1;
  let lastOffset = 1;
  let endMarker: GridConfig['endMarker'];
  for (let r = block.headerRow + 1; r <= Math.min(sheet.maxRow, block.headerRow + 120); r++) {
    const a = textOf(sheet, r, block.catCol);
    const b = textOf(sheet, r, block.itemCol);
    if (/total/i.test(a) || /total/i.test(b)) {
      endMarker = { label: (a || b).trim(), offset: r - block.headerRow };
      break;
    }
    lastOffset = r - block.headerRow;
  }
  const year = yearInName(sheet.name);
  const fromTemplate = template ? (template.config as GridConfig) : null;
  const suggestion: GridConfig = fromTemplate
    ? { ...fromTemplate, year: year ?? fromTemplate.year, title: block.title, catCol: block.catCol, itemCol: block.itemCol, monthCols: block.monthCols }
    : {
        kind: 'GRID',
        department: guessDepartment(sheet.name, ctx.departments),
        year,
        recordType: 'Recorded (source grid)',
        countRole: 'ALWAYS',
        title: block.title,
        catCol: block.catCol,
        itemCol: block.itemCol,
        monthCols: block.monthCols,
        firstOffset,
        lastOffset,
        endMarker,
        idPrefix: abbreviate(baseTabName(sheet.name)),
      };
  const rows: MappingRequest['rows'] = [];
  for (let r = block.headerRow + 1; r <= Math.min(sheet.maxRow, block.headerRow + 60); r++) {
    const category = textOf(sheet, r, block.catCol);
    const item = textOf(sheet, r, block.itemCol);
    const vals = block.monthCols.map((c) => textOf(sheet, r, c)).filter(Boolean);
    if (!category && !item && !vals.length) {
      rows.push({ row: r, category: '', item: '', sample: '' });
      continue;
    }
    rows.push({ row: r, category, item, sample: vals.slice(0, 3).join(' · ') });
  }
  return {
    tab: sheet.name,
    signature: block.signature,
    headerRow: block.headerRow,
    title: block.title,
    catCol: block.catCol,
    itemCol: block.itemCol,
    monthCols: block.monthCols,
    suggestion,
    suggestionSource: template ? template.name : null,
    rows,
  };
}

function guessDepartment(tab: string, departments: string[]): string {
  const t = norm(baseTabName(tab));
  const exact = departments.find((d) => norm(d) === t);
  if (exact) return exact;
  const sorted = [...departments].sort((a, b) => b.length - a.length);
  return sorted.find((d) => t.includes(norm(d))) ?? departments[departments.length - 1] ?? 'Shared / Unassigned';
}

// ------------------------------------------------------------------ P&L tabs

function extractPl(sheet: Sheet, profile: Profile, cfg: PlConfig, fileName: string, out: AnalysisResult, report: TabReport): boolean {
  const year = yearInName(sheet.name);
  if (!year) {
    out.issues.push({ level: 'error', tab: sheet.name, message: 'P&L tab name has no year.' });
    report.status = 'error';
    return true;
  }
  report.kind = 'P&L (revenue' + (cfg.expenseRows.length ? ' + summary expenses)' : ')');
  report.year = year;
  for (const r of [...cfg.expenseRows, ...cfg.revenueRows]) {
    const label = textOf(sheet, r.row, cfg.labelCol);
    if (norm(label) !== norm(r.label)) {
      out.issues.push({ level: 'error', tab: sheet.name, cell: `${cfg.labelCol}${r.row}`, message: `${sheet.name}!${cfg.labelCol}${r.row} should say “${r.label}” but says “${label}”. The tab layout changed; update its layout profile.` });
      report.status = 'error';
      return true;
    }
  }
  if (cfg.expenseRows.length) {
    const prefix = `P:${profile.id}:${year}-`;
    out.scopes.push({ kind: 'expense', prefix, label: `${sheet.name} summary expenses` });
    for (const r of cfg.expenseRows) {
      cfg.monthCols.forEach((col, i) => {
        const cell = getCell(sheet, r.row, col);
        if (cell.kind === 'blank' || (cell.kind === 'number' && cell.num === 0)) return;
        const mm = String(i + 1).padStart(2, '0');
        const month = ymOf(year, i + 1);
        const raw = cell.kind === 'number' ? null : (cell.text ?? '?').trim();
        if (raw) out.issues.push({ level: cell.kind === 'error' ? 'error' : 'warning', tab: sheet.name, cell: `${col}${r.row}`, message: `Non-numeric value “${raw}” in ${sheet.name}!${col}${r.row}.` });
        out.expenses.push({
          key: `${prefix}${mm}:${sheet.name}|${r.label}`,
          kind: 'SUMMARY',
          profileId: profile.id,
          lineKey: `${profile.id}:${sheet.name}|${r.label}`,
          month,
          txnDate: `${month}-01`,
          department: r.department,
          sourceCategory: cfg.expenseCategory,
          categoryOverride: cfg.expenseCategory,
          item: null,
          description: `Total expenses - ${r.label}`,
          vendor: `${r.department} - total (${sheet.name})`,
          vendorOverride: `${r.department} - total (${sheet.name})`,
          amount: cell.kind === 'number' ? numToDecString(cell.num!) : null,
          currency: 'USD',
          rawValue: raw,
          recordType: cfg.expenseRecordType,
          countRole: 'ALWAYS',
          countGroup: null,
          isTrigger: false,
          recurringOverride: null,
          paymentMethod: null,
          reference: null,
          notes: null,
          sourceFile: fileName,
          sheet: sheet.name,
          cell: `${sheet.name}!${col}${r.row}`,
          rowNumber: r.row,
          displayId: `${cfg.idPrefix ?? abbreviate(sheet.name)}-${year}-${mm}-R${r.row}`,
        });
      });
    }
  }
  if (cfg.revenueRows.length) {
    const prefix = `R:${profile.id}:${year}-`;
    out.scopes.push({ kind: 'fact', prefix, label: `${sheet.name} revenue` });
    for (const r of cfg.revenueRows) {
      cfg.monthCols.forEach((col, i) => {
        const cell = getCell(sheet, r.row, col);
        if (cell.kind === 'blank') return;
        const mm = String(i + 1).padStart(2, '0');
        const raw = cell.kind === 'number' ? null : (cell.text ?? '?').trim();
        if (raw) out.issues.push({ level: cell.kind === 'error' ? 'error' : 'warning', tab: sheet.name, cell: `${col}${r.row}`, message: `Non-numeric revenue “${raw}” in ${sheet.name}!${col}${r.row}.` });
        out.facts.push({
          type: 'REVENUE',
          key: `${prefix}${mm}:${r.department}`,
          data: {
            department: r.department,
            month: ymOf(year, i + 1),
            amount: cell.kind === 'number' ? numToDecString(cell.num!) : null,
            rawValue: raw,
            recordType: cfg.revenueRecordType,
            sheet: sheet.name,
            cell: `${sheet.name}!${col}${r.row}`,
          },
        });
      });
    }
  }
  out.facts.push({ type: 'SHEET', key: `SHEET:${sheet.name}:${year}`, data: { sheet: sheet.name, year, ...snapshotSheet(sheet) } });
  out.scopes.push({ kind: 'fact', prefix: `SHEET:${sheet.name}:${year}`, label: `${sheet.name} (cell snapshot)` });
  return true;
}

// ------------------------------------------------------------------ recurring list & domains

export function frequencyFromText(text: string): string {
  const t = text.toLowerCase();
  if (/semi[\s-]?annual|semi[\s-]?annually|6 months|every six months/.test(t)) return 'Semi-Annual';
  if (/semi[\s-]?monthly|twice a month/.test(t)) return 'Semi-Monthly';
  if (/\byearly\b|\bannual(ly)?\b|per year|\/yr\b/.test(t)) return 'Annual';
  if (/4 months|every four months/.test(t)) return 'Every 4 months';
  if (/quarter/.test(t)) return 'Quarterly';
  if (/bi[\s-]?weekly|every two weeks|fortnight/.test(t)) return 'Bi-Weekly';
  if (/\bweekly\b/.test(t)) return 'Weekly';
  if (/one[\s-]?time|once\b/.test(t)) return 'One-Time';
  return 'Monthly';
}

function extractRecurring(sheet: Sheet, profile: Profile, cfg: RecurringConfig, out: AnalysisResult) {
  out.scopes.push({ kind: 'fact', prefix: `REC:${profile.id}:`, label: `${sheet.name} recurring list` });
  const seen = new Map<string, number>();
  let order = 0;
  for (let r = cfg.firstRow; r <= sheet.maxRow; r++) {
    const name = textOf(sheet, r, cfg.nameCol);
    if (!name) continue;
    if (/^sub\s*-?\s*total$/i.test(name) || /^total$/i.test(name)) continue;
    const detail = cfg.detailCols.map((c) => textOf(sheet, r, c)).find(Boolean) ?? '';
    const notes = cfg.noteCols.map((c) => textOf(sheet, r, c)).filter((t) => t && t !== detail).join(' ');
    const amountCell = getCell(sheet, r, cfg.amountCol);
    const amount = amountCell.kind === 'number' ? numToDecString(amountCell.num!) : null;
    const listed = amountCell.kind === 'blank' ? '' : amountCell.kind === 'number' ? String(amountCell.num) : (amountCell.text ?? '').trim();
    const itemKey = `${norm(name)}|${norm(detail)}`;
    const n = (seen.get(itemKey) ?? 0) + 1;
    seen.set(itemKey, n);
    out.facts.push({
      type: 'RECURRING',
      key: `REC:${profile.id}:${itemKey}${n > 1 ? `#${n}` : ''}`,
      data: {
        itemKey: `${itemKey}${n > 1 ? `#${n}` : ''}`,
        name,
        detail,
        notes,
        listed,
        amount,
        frequency: frequencyFromText(`${detail} ${notes}`),
        sourceCell: `${sheet.name}!${cfg.nameCol}${r}:${cfg.amountCol}${r}`,
        order: order++,
      },
    });
  }
  if (cfg.domains) {
    const d = cfg.domains;
    out.scopes.push({ kind: 'fact', prefix: `DOM:${profile.id}:`, label: `${sheet.name} domains` });
    for (let r = d.firstRow; r <= sheet.maxRow; r++) {
      const domain = textOf(sheet, r, d.domainCol);
      if (!domain) continue;
      if (/^total$/i.test(domain)) break;
      if (!/\./.test(domain)) continue;
      const renewalCell = getCell(sheet, r, d.renewalCol);
      out.facts.push({
        type: 'DOMAIN',
        key: `DOM:${profile.id}:${domain.toLowerCase()}`,
        data: {
          domain,
          price: textOf(sheet, r, d.priceCol),
          renewal: cellToYmd(renewalCell),
          note: textOf(sheet, r, d.noteCol),
          sourceCell: `${sheet.name}!${d.domainCol}${r}:${d.noteCol}${r}`,
        },
      });
    }
  }
}

function extractSnapshot(sheet: Sheet, profile: Profile, cfg: SnapshotConfig, out: AnalysisResult) {
  out.scopes.push({ kind: 'fact', prefix: `SNAP:${profile.id}:`, label: `${sheet.name} snapshot` });
  const seen = new Map<string, number>();
  const num = (r: number, col?: string) => {
    if (!col) return null;
    const c = getCell(sheet, r, col);
    return c.kind === 'number' ? c.num! : null;
  };
  for (let r = cfg.firstRow; r <= sheet.maxRow; r++) {
    const name = textOf(sheet, r, cfg.nameCol);
    if (!name) continue;
    if (/^sub\s*-?\s*total$/i.test(name)) break;
    const detail = textOf(sheet, r, cfg.detailCol);
    const q = num(r, cfg.monthlyCol);
    const p = num(r, cfg.semiMonthlyCol);
    const ra = num(r, cfg.semiAnnualCol);
    const s = num(r, cfg.annualCol);
    let monthly: number | null = null;
    if (q && q > 0) monthly = q;
    else if (p && p > 0) monthly = p * 2;
    else if (ra && ra > 0) monthly = ra / 6;
    else if (s && s > 0) monthly = s / 12;
    else if (q === 0) monthly = 0;
    const chargeCell = cfg.chargeDateCol ? getCell(sheet, r, cfg.chargeDateCol) : null;
    const charge = chargeCell ? (chargeCell.kind === 'number' && chargeCell.isDate ? cellToYmd(chargeCell) : textOf(sheet, r, cfg.chargeDateCol!)) : '';
    const itemKey = `${norm(name)}|${norm(detail)}`;
    const n = (seen.get(itemKey) ?? 0) + 1;
    seen.set(itemKey, n);
    out.facts.push({
      type: 'SNAPSHOT_ITEM',
      key: `SNAP:${profile.id}:${itemKey}${n > 1 ? `#${n}` : ''}`,
      data: {
        itemKey: `${itemKey}${n > 1 ? `#${n}` : ''}`,
        name: name.trim(),
        detail,
        monthly: monthly === null ? null : String(monthly),
        paymentMethod: cfg.paymentCol ? textOf(sheet, r, cfg.paymentCol) : '',
        chargeDate: charge ?? '',
        sourceCell: `${sheet.name}!${cfg.nameCol}${r}`,
        order: r,
      },
    });
  }
}

// ------------------------------------------------------------------ transaction lists (Expense Entry template)

function normStatus(s: string): string | null {
  const t = norm(s);
  if (!t) return null;
  return PAY_STATUSES.find((p) => norm(p) === t) ?? null;
}

function parseAmount(text: string): string | null {
  const t = text.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  return /^-?\d+(\.\d+)?$/.test(t) ? t : null;
}

function extractTransactions(sheet: Sheet, profile: Profile, cfg: TransactionsConfig, fileName: string, ctx: AnalyzeContext, out: AnalysisResult) {
  out.scopes.push({ kind: 'expense', prefix: `T:${profile.id}:`, label: `${sheet.name} transactions` });
  const col = cfg.columns;
  const t = (r: number, f: keyof typeof col) => (col[f] ? textOf(sheet, r, col[f]!) : '');
  const refs = new Set<string>();
  for (let r = cfg.headerRow + 1; r <= sheet.maxRow; r++) {
    const fields = Object.values(col).map((c) => textOf(sheet, r, c!));
    if (fields.every((v) => !v)) continue;
    const dateCell = col.transactionDate ? getCell(sheet, r, col.transactionDate) : ({ kind: 'blank' } as const);
    const txnDate = cellToYmd(dateCell as never);
    const amountCell = col.amount ? getCell(sheet, r, col.amount) : ({ kind: 'blank' } as const);
    let amount: string | null = null;
    let raw: string | null = null;
    if (amountCell.kind === 'number') amount = numToDecString((amountCell as { num: number }).num);
    else if (amountCell.kind !== 'blank') {
      const text = (amountCell as { text?: string }).text ?? '';
      amount = parseAmount(text);
      if (amount === null) raw = text.trim() || '?';
    } else raw = '';
    const dept = t(r, 'department');
    const category = t(r, 'category');
    const description = t(r, 'description');
    const vendor = t(r, 'vendor');
    const reference = t(r, 'reference');
    const currency = (t(r, 'currency') || 'USD').toUpperCase();
    const ref = `${sheet.name}!A${r}`;
    if (!txnDate) out.issues.push({ level: 'warning', tab: sheet.name, cell: ref, message: `Row ${r}: missing or invalid transaction date.` });
    if (raw !== null) out.issues.push({ level: 'warning', tab: sheet.name, cell: ref, message: `Row ${r}: amount “${raw}” is not a number.` });
    if (dept && !ctx.departments.some((d) => norm(d) === norm(dept))) out.issues.push({ level: 'warning', tab: sheet.name, cell: ref, message: `Row ${r}: unknown department “${dept}”.` });
    let key: string;
    if (reference) {
      const k = norm(reference);
      if (refs.has(k)) {
        out.issues.push({ level: 'error', tab: sheet.name, cell: ref, message: `Row ${r}: reference “${reference}” appears more than once in this list.` });
        continue;
      }
      refs.add(k);
      key = `T:${profile.id}:ref:${k}`;
    } else {
      const h = crypto.createHash('sha256').update([txnDate ?? '', norm(dept), norm(description), amount ?? raw ?? '', r].join('|')).digest('hex').slice(0, 24);
      key = `T:${profile.id}:h:${h}`;
    }
    const deptName = ctx.departments.find((d) => norm(d) === norm(dept)) ?? (dept || null);
    const rec = norm(t(r, 'recurring'));
    out.expenses.push({
      key,
      kind: 'TRANSACTION',
      profileId: profile.id,
      lineKey: null,
      month: txnDate ? txnDate.slice(0, 7) : null,
      txnDate,
      department: deptName,
      sourceCategory: category || null,
      categoryOverride: null,
      item: vendor || null,
      description: description || vendor || '(no description)',
      vendor: vendor || `${category || 'Uncategorized'} - unspecified (${deptName ?? 'no department'})`,
      vendorOverride: null,
      amount,
      currency,
      rawValue: raw,
      recordType: 'Transaction (uploaded list)',
      countRole: 'ALWAYS',
      countGroup: null,
      isTrigger: false,
      recurringOverride: rec.startsWith('recur') ? 'Recurring' : rec.startsWith('one') ? 'One-Time' : null,
      paymentMethod: t(r, 'paymentMethod') || null,
      reference: reference || null,
      notes: t(r, 'notes') || null,
      sourceFile: fileName,
      sheet: sheet.name,
      cell: `${sheet.name}!${col.amount ?? 'A'}${r}`,
      rowNumber: r,
      displayId: reference || `${abbreviate(sheet.name)}-R${r}`,
      initialStatus: normStatus(t(r, 'paymentStatus')),
      initialDueDate: col.dueDate ? cellToYmd(getCell(sheet, r, col.dueDate)) : null,
    });
  }
}

export type { PlanExpense, PlanFact, Scope, Issue };
