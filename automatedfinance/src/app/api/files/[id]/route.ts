import { prisma } from '@/lib/db';
import { apiUser } from '@/lib/server/auth';
import { audit } from '@/lib/security/audit';
import { clientIp, userAgent } from '@/lib/security/request';

/** Uploaded originals are stored in the database, never under a public URL, and only Admins can download them. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await apiUser(req, 'ADMIN');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const file = await prisma.sourceFile.findUnique({ where: { id } });
  if (!file) return Response.json({ error: 'Not found' }, { status: 404 });
  await audit({ action: 'file.download', userId: auth.user.userId, target: file.filename, details: { id }, ip: clientIp(req.headers), userAgent: userAgent(req.headers) });
  const safeName = file.filename.replace(/[^\w.\- ]+/g, '_');
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'content-type': /\.csv$/i.test(file.filename) ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${safeName}"`,
      'cache-control': 'no-store',
    },
  });
}
