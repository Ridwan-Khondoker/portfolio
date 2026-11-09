import { prisma } from '@/lib/db';
import { apiUser } from '@/lib/server/auth';
import { audit } from '@/lib/security/audit';
import { clientIp, userAgent } from '@/lib/security/request';
import { XLSX } from '@/lib/importer/workbook';
import { loadCurrentFacts } from '@/lib/server/data';
import { loadRecurring, loadState } from '@/lib/server/state';
import { exportRows } from '@/lib/server/transactions';

/** Admin "Export everything": one workbook with every current fact, reference table, setting and the audit log. */
export async function GET(req: Request) {
  const auth = await apiUser(req, 'ADMIN');
  if ('response' in auth) return auth.response;
  const state = await loadState();
  const batches = await prisma.importBatch.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, label: true, origin: true, status: true, createdAt: true, committedAt: true, rolledBackAt: true, createdById: true, committedById: true } });
  const batchMap = new Map(batches.map((b) => [b.id, b]));
  const [categories, mappings, budgets, fx, settings, issues, statuses, scenarios, seasonality, planned, profiles, users, auditLog, recurring, domains] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.categoryMapping.findMany({ orderBy: { sourceLabel: 'asc' } }),
    prisma.budget.findMany(),
    prisma.fxRate.findMany(),
    prisma.setting.findMany(),
    prisma.issueLogItem.findMany({ orderBy: { n: 'asc' } }),
    prisma.paymentStatus.findMany(),
    prisma.scenario.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.seasonalityIndex.findMany({ orderBy: { month: 'asc' } }),
    prisma.plannedExpense.findMany(),
    prisma.layoutProfile.findMany(),
    prisma.user.findMany({ select: { email: true, name: true, role: true, active: true, totpEnabled: true, lastLoginAt: true, createdAt: true } }),
    prisma.auditLog.findMany({ orderBy: { at: 'desc' }, take: 20000 }),
    loadRecurring(state.ref.departments),
    loadCurrentFacts('DOMAIN'),
  ]);
  const sheet = (rows: Record<string, unknown>[]) =>
    XLSX.utils.json_to_sheet(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : typeof v === 'object' && v !== null ? JSON.stringify(v) : (v as string | number | boolean | null)]))));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(exportRows(state.rows, batchMap)), 'Expenses (all current rows)');
  XLSX.utils.book_append_sheet(wb, sheet(state.revenue.map((r) => ({ month: r.month, department: r.department, amount: r.amount ? Number(r.amount) : null, recordType: r.recordType, sourceCell: r.cell }))), 'Revenue');
  XLSX.utils.book_append_sheet(wb, sheet(recurring.rows.map((r) => ({ ...r, snapshot: r.snapshot?.name ?? '', snapshotMonthly: r.snapshot?.monthly ?? null }))), 'Recurring');
  XLSX.utils.book_append_sheet(wb, sheet(domains.map((d) => d.data as Record<string, unknown>)), 'Domains');
  XLSX.utils.book_append_sheet(wb, sheet(statuses.map((s) => ({ key: s.key, status: s.status, dueDate: s.dueDate, note: s.note, updatedAt: s.updatedAt }))), 'Payment statuses');
  XLSX.utils.book_append_sheet(wb, sheet(categories), 'Categories');
  XLSX.utils.book_append_sheet(wb, sheet(mappings), 'Category mapping');
  XLSX.utils.book_append_sheet(wb, sheet(budgets.map((b) => ({ ...b, monthlyAmount: Number(b.monthlyAmount) }))), 'Budgets');
  XLSX.utils.book_append_sheet(wb, sheet(fx.map((f) => ({ ...f, unitsPerUsd: f.unitsPerUsd ? Number(f.unitsPerUsd) : null }))), 'FX rates');
  XLSX.utils.book_append_sheet(wb, sheet(settings), 'Settings');
  XLSX.utils.book_append_sheet(wb, sheet(scenarios.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'object' && v !== null && 'toNumber' in v ? Number(v) : v])))), 'Scenarios');
  XLSX.utils.book_append_sheet(wb, sheet(seasonality.map((s) => ({ month: s.month, index: Number(s.idx) }))), 'Seasonality');
  XLSX.utils.book_append_sheet(wb, sheet(planned.map((p) => ({ ...p, amount: Number(p.amount) }))), 'Planned expenses');
  XLSX.utils.book_append_sheet(wb, sheet(issues), 'Issues log');
  XLSX.utils.book_append_sheet(wb, sheet(profiles), 'Layout profiles');
  XLSX.utils.book_append_sheet(wb, sheet(batches), 'Import batches');
  XLSX.utils.book_append_sheet(wb, sheet(users), 'Users');
  XLSX.utils.book_append_sheet(wb, sheet(auditLog.map((a) => ({ ...a, id: String(a.id) }))), 'Audit log');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  await audit({ action: 'export.everything', userId: auth.user.userId, details: { rows: state.rows.length }, ip: clientIp(req.headers), userAgent: userAgent(req.headers) });
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="automatedfinance-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
}
