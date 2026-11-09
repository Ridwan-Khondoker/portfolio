import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import { encrypt } from '@/lib/security/crypto';
import { hashPassword } from '@/lib/security/password';
import { generateTotpSecret } from '@/lib/security/totp';

export const PASSWORD = 'Synthetic-Test-Passphrase-42';

/** Synthetic users only: the security tests never need company data. */
export async function makeUser(email: string, role: Role, opts: { totp?: boolean } = {}) {
  const withTotp = opts.totp ?? true;
  const secret = generateTotpSecret();
  const totp = withTotp ? { totpSecretEnc: encrypt(secret), totpEnabled: true } : { totpSecretEnc: null, totpEnabled: false };
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, role, passwordHash: await hashPassword(PASSWORD), ...totp, active: true },
    update: { role, passwordHash: await hashPassword(PASSWORD), ...totp, active: true, totpLastStep: null, totpPendingEnc: null },
  });
  return { ...user, secret };
}
