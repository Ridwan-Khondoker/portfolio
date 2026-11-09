import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Automated Finance', template: '%s · Automated Finance' },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

export const viewport: Viewport = { themeColor: '#F5A300', width: 'device-width', initialScale: 1 };

// Every page is rendered per request: data is private and the CSP nonce is per request.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
