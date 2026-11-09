import { apiUser } from '@/lib/server/auth';
import { TXN_FIELDS, TXN_HEADERS } from '@/lib/importer/types';
import { XLSX } from '@/lib/importer/workbook';
import { prisma } from '@/lib/db';

/** Blank Expense Entry template (same columns the importer recognises), with the allowed values on a second tab. */
export async function GET(req: Request) {
  const auth = await apiUser(req, 'EDITOR');
  if ('response' in auth) return auth.response;
  const [departments, categories, fx] = await Promise.all([
    prisma.department.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.fxRate.findMany({ orderBy: { code: 'asc' } }),
  ]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([TXN_FIELDS.map((f) => TXN_HEADERS[f])]);
  ws['!cols'] = TXN_FIELDS.map((f) => ({ wch: f === 'description' || f === 'notes' ? 36 : 18 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Expense Entry');
  const lists: (string | null)[][] = [['Departments', 'Categories', 'Currencies', 'Payment Status', 'Recurring / One-Time']];
  const n = Math.max(departments.length, categories.length, fx.length, 4);
  for (let i = 0; i < n; i++)
    lists.push([departments[i]?.name ?? null, categories[i]?.name ?? null, fx[i]?.code ?? null, ['Paid', 'Pending', 'Overdue', 'Not recorded'][i] ?? null, ['Recurring', 'One-Time'][i] ?? null]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lists), 'Allowed values');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="expense-entry-template.xlsx"',
      'cache-control': 'no-store',
    },
  });
}
