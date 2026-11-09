import { apiUser } from '@/lib/server/auth';
import { exportRows, queryTransactions } from '@/lib/server/transactions';
import { toCsv } from '@/lib/csv';
import { XLSX } from '@/lib/importer/workbook';
import { audit } from '@/lib/security/audit';
import { clientIp, userAgent } from '@/lib/security/request';

export async function GET(req: Request) {
  const auth = await apiUser(req, 'VIEWER');
  if ('response' in auth) return auth.response;
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const { rows, batches } = await queryTransactions(params);
  const data = exportRows(rows, batches);
  const format = url.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv';
  const stamp = new Date().toISOString().slice(0, 10);
  await audit({ action: 'export.transactions', userId: auth.user.userId, details: { format, rows: rows.length, params }, ip: clientIp(req.headers), userAgent: userAgent(req.headers) });
  if (format === 'csv') {
    return new Response('﻿' + toCsv(data), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="transactions-${stamp}.csv"`, 'cache-control': 'no-store' },
    });
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Transactions');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="transactions-${stamp}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
}
