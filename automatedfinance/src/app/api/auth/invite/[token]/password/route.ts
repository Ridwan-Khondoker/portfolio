import { linkPasswordStep } from '@/lib/server/auth-routes';

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return linkPasswordStep(req, token, 'INVITE');
}
