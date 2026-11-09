// npm run seed:admin: one-time creation of the first admin. Prints an invite link (72 hours, single use) where the
// admin sets a password and enrolls 2FA. Refuses to run once an active admin exists unless --force.
import { prisma } from '../src/lib/db';
import { createLink, isEmail, normalizeEmail } from '../src/lib/server/accounts';
import { appUrl } from '../src/lib/env';
import { audit } from '../src/lib/security/audit';

async function main() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL || '');
  if (!isEmail(email)) throw new Error('Set ADMIN_EMAIL to the first admin’s email address.');
  const existing = await prisma.user.count({ where: { role: 'ADMIN', active: true, totpEnabled: true } });
  if (existing && !process.argv.includes('--force')) {
    console.error('An admin already exists. Invite more users from the Users page (or pass --force to issue another admin invite).');
    process.exit(1);
  }
  const token = await createLink({ kind: 'INVITE', email, role: 'ADMIN', createdById: null });
  await audit({ action: 'invite.created', email, target: email, details: { role: 'ADMIN', via: 'seed:admin' } });
  console.log(`\nAdmin invite for ${email} (valid 72 hours, single use):\n\n  ${new URL(`/invite/${token}`, appUrl()).toString()}\n\nOpen it, choose a password and scan the 2FA QR code.\n`);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
