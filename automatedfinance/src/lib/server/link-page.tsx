import type { TokenKind } from '@prisma/client';
import { findValidLink } from './accounts';
import { LinkFlow } from '@/components/auth/LinkFlow';

export async function renderLinkPage(token: string, kind: TokenKind) {
  const row = await findValidLink(token, kind);
  if (!row) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Link not valid</h1>
        <p className="text-sm">This link is invalid, has expired (links last 72 hours) or has already been used. Ask an admin for a new one.</p>
      </div>
    );
  }
  return <LinkFlow kind={kind === 'INVITE' ? 'invite' : 'reset'} token={token} email={row.email} />;
}
