// npm run seed:admin: one-time creation of the first admin. Prints an invite link (72 hours, single use) where the
// admin sets a password and enrolls 2FA. Refuses to run once an active admin exists unless --force.
import { prisma } from '../src/lib/db';
import { createLink, isEmail, normalizeEmail } from '../src/lib/server/accounts';
import { appUrl } from '../src/lib/env';
import { audit } from '../src/lib/security/audit';

// --if-none (used at server start): do nothing when an admin exists or an admin invite is still open, so restarts
// never invalidate a link someone is using. Run `npm run seed:admin -- --force` to issue a fresh link.
async function main() {
  const ifNone = process.argv.includes('--if-none');
  const email = normalizeEmail(process.env.ADMIN_EMAIL || '');
  if (!isEmail(email)) {
    if (ifNone) return console.log('[seed:admin] ADMIN_EMAIL not set; skipping first-admin bootstrap.');
    throw new Error('Set ADMIN_EMAIL to the first admin’s email address.');
  }
  const existing = await prisma.user.count({ where: { role: 'ADMIN', active: true, passwordHash: { not: null } } });
  if (existing && !process.argv.includes('--force')) {
    if (ifNone) return;
    console.error('An admin already exists. Invite more users from the Users page (or pass --force to issue another admin invite).');
    process.exit(1);
  }
  if (ifNone) {
    const open = await prisma.authToken.count({ where: { email, kind: 'INVITE', role: 'ADMIN', usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (open) return console.log('[seed:admin] An admin invite is already open (see the earlier log line). Run `npm run seed:admin -- --force` for a new link.');
  }
  const token = await createLink({ kind: 'INVITE', email, role: 'ADMIN', createdById: null });
  await audit({ action: 'invite.created', email, target: email, details: { role: 'ADMIN', via: 'seed:admin' } });
  console.log(`\nAdmin invite for ${email} (valid 72 hours, single use):\n\n  ${new URL(`/invite/${token}`, appUrl()).toString()}\n\nOpen it and choose a password.\n`);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
