// Marks the database in DATABASE_URL as the production database (Phase 7A), or removes the
// mark. Run it once, on the production branch only:
//
//   npm run db:mark-production -- --yes            mark it
//   npm run db:mark-production -- --unmark --yes   remove the mark (only to test the guards
//                                                 on a test branch; never on production)
//
// It prints the database host (never the password) so you can see which branch it touched.
import { createPrisma } from '../src/db';
import { loadEnv } from '../src/env';
import { ENVIRONMENT_FLAG, PRODUCTION, isProductionDatabase } from '../src/safety';

const env = loadEnv();
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const host = new URL(env.DATABASE_URL).host;
const unmark = process.argv.includes('--unmark');
if (!process.argv.includes('--yes')) {
  console.log(
    `This will ${unmark ? 'REMOVE the production mark from' : 'mark as PRODUCTION'} the database at ${host}.`,
  );
  console.log('Run it again with --yes to go ahead.');
  process.exit(1);
}

const prisma = createPrisma(env.DATABASE_URL);
try {
  if (unmark) {
    await prisma.systemFlag.deleteMany({ where: { key: ENVIRONMENT_FLAG } });
  } else {
    await prisma.systemFlag.upsert({
      where: { key: ENVIRONMENT_FLAG },
      update: { value: PRODUCTION },
      create: { key: ENVIRONMENT_FLAG, value: PRODUCTION },
    });
  }
  const marked = await isProductionDatabase(prisma);
  console.log(`${host}: ${marked ? 'marked as the PRODUCTION database' : 'not production'}.`);
} finally {
  await prisma.$disconnect();
}
