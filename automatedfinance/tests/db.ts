import { prisma } from '@/lib/db';

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (!tables.length) return;
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

export async function setAsOf(date: string) {
  await prisma.setting.upsert({ where: { key: 'asOfDate' }, create: { key: 'asOfDate', value: date }, update: { value: date } });
}
