// npm run seed: loads categories, mappings, budgets, settings, issues and layouts from data/, then imports the
// original workbook through the real importer. Safe to re-run (reference data is upserted; the workbook is imported once
// unless --force). Reads DATA_DIR / WORKBOOK_PATH (defaults: ./data and ./source-workbooks/ORIGINAL_Google_Sheet_export.xlsx).
import { prisma } from '../src/lib/db';
import { kitAvailable, kitPaths, loadKit } from '../src/lib/seed/kit';
import { seedAll } from '../src/lib/seed/seed';

async function main() {
  if (!kitAvailable()) {
    const p = kitPaths();
    console.error(`Company data not found.\n  expected ${p.dataDir}/source_layouts.json and ${p.workbookPath}\nSet DATA_DIR and WORKBOOK_PATH, or copy the kit folders next to package.json.`);
    process.exit(1);
  }
  const report = await seedAll(prisma, loadKit(), { force: process.argv.includes('--force') });
  console.log('Seed complete:', JSON.stringify(report, null, 2));
  if (!report.imported) console.log('The workbook was not re-imported because data already exists (use --force to import it again).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
