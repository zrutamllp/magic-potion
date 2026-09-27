import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { MAX_TEAMS, MIN_TEAMS } from '@magic-potion/shared';
import { createPrisma } from '../src/db';
import { FakeClock } from '../src/engine/clock';
import { createSampleGame } from '../src/engine/dbGame';
import { GameEngine } from '../src/engine/engine';
import { canonicalJson, loadGame } from '../src/engine/load';
import { memoryEngine } from '../src/engine/memoryGame';
import { PrismaPersistence } from '../src/engine/persistence/prisma';
import { seededRng } from '../src/engine/rng';
import { checkBalances } from '../src/ledger/ledger';
import { loadEnv } from '../src/env';
import { formatReport, toCsv } from './sim/report';
import { runSimulation, type LedgerRow, type SimSetup } from './sim/run';

// Plays a full game with simulated teams and prints the final leaderboard.
//
//   npm run simulate -w @magic-potion/server -- --teams 20 --seed 42
//
// Options:
//   --teams N        number of teams (default 20)
//   --seed N         random seed; the same seed gives the same game (default 42)
//   --full-potion    strong teams that all finish, so the Full Potion Bonus shows
//   --remove N       the admin removes N teams during Round 2
//   --csv FILE       also write the leaderboard as CSV
//   --db             save to the database in DATABASE_URL, then rebuild from it and compare
//   --keep           with --db, keep the simulated game instead of deleting it

const { values } = parseArgs({
  options: {
    teams: { type: 'string', default: '20' },
    seed: { type: 'string', default: '42' },
    'full-potion': { type: 'boolean', default: false },
    remove: { type: 'string', default: '0' },
    csv: { type: 'string' },
    db: { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
  },
});

const teams = Number(values.teams);
const seed = Number(values.seed);
const removeTeams = Number(values.remove);
if (!Number.isInteger(teams) || teams < MIN_TEAMS || teams > MAX_TEAMS) {
  throw new Error(`--teams must be a whole number from ${MIN_TEAMS} to ${MAX_TEAMS}`);
}
if (!Number.isInteger(seed)) throw new Error('--seed must be a whole number');
if (!Number.isInteger(removeTeams) || removeTeams < 0 || removeTeams >= teams - 1) {
  throw new Error('--remove must be a small whole number');
}

// A fixed start time, so the same seed always prints the same game.
const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);
const opts = { seed, fullPotion: values['full-potion'], removeTeams };
const title = `Magic Potion simulation: ${teams} teams, seed ${seed}${opts.fullPotion ? ', full potion' : ''}${values.db ? ', database' : ''}`;

async function inMemory() {
  const clock = new FakeClock(T0);
  const { engine, persistence } = memoryEngine({ teams, clock, seed });
  const setup: SimSetup = {
    engine,
    clock,
    staffUserId: 'simulated-admin',
    ledgerRows: async () =>
      persistence.log.flatMap((c): LedgerRow[] =>
        c.kind === 'ledger'
          ? [
              {
                teamId: c.teamId,
                wallet: c.wallet,
                amount: c.amount,
                kind: c.ledgerKind,
                balanceAfter: c.balanceAfter,
              },
            ]
          : [],
      ),
  };
  return runSimulation(setup, opts);
}

async function inDatabase() {
  const env = loadEnv();
  if (!env.DATABASE_URL) throw new Error('--db needs DATABASE_URL in apps/server/.env');
  const prisma = createPrisma(env.DATABASE_URL);
  let gameId: string | undefined;
  try {
    const admin = await prisma.staffUser.findFirst({ where: { role: 'MAIN_ADMIN' } });
    if (!admin) throw new Error('No main admin found. Run npm run db:seed first.');
    gameId = await createSampleGame(prisma, {
      name: `Simulation ${new Date().toISOString()}`,
      teams,
    });
    console.log(`Created simulated game ${gameId}. This takes a few minutes...`);
    const clock = new FakeClock(T0);
    const loaded = await loadGame(prisma, gameId);
    const engine = new GameEngine({
      ...loaded,
      persistence: new PrismaPersistence(prisma),
      clock,
      rng: seededRng(seed),
    });
    const id = gameId;
    const result = await runSimulation(
      {
        engine,
        clock,
        staffUserId: admin.id,
        ledgerRows: async () =>
          (
            await prisma.fundTransaction.findMany({
              where: { team: { gameId: id } },
              select: { teamId: true, wallet: true, amount: true, kind: true, balanceAfter: true },
            })
          ).map((r) => ({ ...r })),
      },
      opts,
    );
    // The restart test: rebuild the game from the database and compare.
    const rebuilt = await loadGame(prisma, id);
    const same = canonicalJson(rebuilt.state) === canonicalJson(engine.state);
    result.checks.push({ name: 'Game rebuilt from the database matches memory exactly', ok: same });
    const mismatches = await checkBalances(prisma, id);
    result.checks.push({
      name: 'Database balances match the database ledger',
      ok: mismatches.length === 0,
    });
    return result;
  } finally {
    if (gameId && !values.keep) {
      await prisma.game.delete({ where: { id: gameId } });
    } else if (gameId) {
      console.log(`Kept simulated game ${gameId}.`);
    }
    await prisma.$disconnect();
  }
}

const started = Date.now();
const result = values.db ? await inDatabase() : await inMemory();
console.log(formatReport(result, title));
console.log(`\nSimulated in ${((Date.now() - started) / 1000).toFixed(1)} seconds.`);
if (values.csv) {
  writeFileSync(values.csv, toCsv(result));
  console.log(`Leaderboard written to ${values.csv}`);
}
process.exitCode = result.checks.every((c) => c.ok) ? 0 : 1;
