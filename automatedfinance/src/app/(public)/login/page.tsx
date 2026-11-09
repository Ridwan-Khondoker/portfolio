import { cookies } from 'next/headers';
import { sessionCookieName, validateSessionToken } from '@/lib/security/session';
import { safeNextPath } from '@/lib/security/public-routes';
import { PasswordSignIn } from '@/components/auth/PasswordSignIn';
import { CodeSignIn } from '@/components/auth/CodeSignIn';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const jar = await cookies();
  const session = await validateSessionToken(jar.get(sessionCookieName())?.value);
  if (session && !session.mfaVerified) return <CodeSignIn next={safeNextPath(next)} />;
  return <PasswordSignIn />;
}
