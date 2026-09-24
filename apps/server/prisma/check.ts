import { createPrisma } from '../src/db';
import { loadEnv } from '../src/env';
import { checkBalances } from '../src/ledger/ledger';

// Prints row counts and checks cached balances against the ledger for every game.

const env = loadEnv();
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const prisma = createPrisma(env.DATABASE_URL);

try {
  console.table({
    staffUsers: await prisma.staffUser.count(),
    taskDefinitions: await prisma.taskDefinition.count(),
    games: await prisma.game.count(),
    teams: await prisma.team.count(),
    taskContents: await prisma.taskContent.count(),
    inboxItems: await prisma.inboxItem.count(),
    ledgerRows: await prisma.fundTransaction.count(),
  });

  const games = await prisma.game.findMany({
    select: { id: true, name: true, phase: true, _count: { select: { teams: true } } },
  });
  let problems = 0;
  for (const game of games) {
    const mismatches = await checkBalances(prisma, game.id);
    problems += mismatches.length;
    console.log(
      `${game.name} (${game.phase}, ${game._count.teams} teams): ${mismatches.length} balance mismatches`,
    );
    for (const m of mismatches) console.log('  ', m);
  }
  if (problems > 0) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
