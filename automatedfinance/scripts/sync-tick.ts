// npm run sync:tick [-- --force]: sync every Google sheet source that is due (or all of them with --force).
import { prisma } from '../src/lib/db';
import { syncDue } from '../src/lib/server/google-sync';

syncDue(process.argv.includes('--force'))
  .then((r) => console.log(r.skipped ? `Skipped: ${r.skipped}` : `Synced ${r.ran} source(s).`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
