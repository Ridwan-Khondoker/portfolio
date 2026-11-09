import { renderLinkPage } from '@/lib/server/link-page';

export const metadata = { title: 'Reset access' };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return renderLinkPage(token, 'RESET');
}
