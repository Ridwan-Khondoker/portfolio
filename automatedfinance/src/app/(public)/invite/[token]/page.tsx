import { renderLinkPage } from '@/lib/server/link-page';

export const metadata = { title: 'Accept invitation' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return renderLinkPage(token, 'INVITE');
}
