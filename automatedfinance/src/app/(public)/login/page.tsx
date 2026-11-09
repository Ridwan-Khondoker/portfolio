import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { sessionCookieName, validateSessionToken } from '@/lib/security/session';
import { safeNextPath } from '@/lib/security/public-routes';
import { enrollmentSecret } from '@/lib/server/accounts';
import { totpQrSvg } from '@/lib/server/totp-qr';
import { PasswordSignIn } from '@/components/auth/PasswordSignIn';
import { CodeSignIn } from '@/components/auth/CodeSignIn';
import { TotpEnroll } from '@/components/auth/TotpEnroll';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = safeNextPath(next);
  const jar = await cookies();
  const session = await validateSessionToken(jar.get(sessionCookieName())?.value);
  if (session && !session.mfaVerified) {
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (user?.totpEnabled) return <CodeSignIn next={target} />;
    // Password accepted, and Settings requires two-step verification for this role: set it up to continue.
    const secret = await enrollmentSecret(session.userId);
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Set up two-step verification</h1>
        <TotpEnroll qrSvg={await totpQrSvg(secret, session.email)} secret={secret} doneHref={target} intro="Your organisation requires a second step at sign-in for your role. This takes a minute and only happens once." />
      </div>
    );
  }
  return <PasswordSignIn next={target} />;
}
