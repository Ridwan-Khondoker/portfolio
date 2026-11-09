import QRCode from 'qrcode';
import type { TokenKind } from '@prisma/client';
import { findValidLink, pendingTotpSecret } from './accounts';
import { otpauthUrl } from '@/lib/security/totp';
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
  const flowKind = kind === 'INVITE' ? 'invite' : 'reset';
  const secret = pendingTotpSecret(row);
  if (!secret) return <LinkFlow kind={flowKind} token={token} email={row.email} step="password" />;
  const qrSvg = await QRCode.toString(otpauthUrl(secret, row.email, 'Automated Finance'), { type: 'svg', margin: 1, color: { dark: '#161513', light: '#ffffff' } });
  return <LinkFlow kind={flowKind} token={token} email={row.email} step="totp" qrSvg={qrSvg} secret={secret} />;
}
