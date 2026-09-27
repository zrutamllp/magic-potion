// Creates and deletes the throwaway games used by `npm run screenshots` (e2e/screenshots.spec.ts).
//
//   node --env-file-if-exists=.env --import tsx scripts/screenshotGames.ts create
//     prints JSON: a staff token, and two games with known team logins
//   node --env-file-if-exists=.env --import tsx scripts/screenshotGames.ts delete <gameId>...
//
// The real Demo Game is never touched. Local use only: it signs a staff token with JWT_SECRET.
import bcrypt from 'bcryptjs';
import { DEFAULT_SETTINGS } from '@magic-potion/shared';
import { Tokens } from '../src/auth/tokens';
import { createPrisma } from '../src/db';
import { createSampleGame } from '../src/engine/dbGame';
import { loadEnv } from '../src/env';

export const SCREENSHOT_PASSWORD = 'screenshot-pass';

const env = loadEnv();
if (!env.DATABASE_URL || !env.JWT_SECRET || !env.ADMIN_SEED_EMAIL) {
  throw new Error('DATABASE_URL, JWT_SECRET and ADMIN_SEED_EMAIL are needed in apps/server/.env');
}
const prisma = createPrisma(env.DATABASE_URL);
const [command, ...args] = process.argv.slice(2);

// Two inbox tasks out at the start so the Inbox screenshot has something to show.
const settings = structuredClone(DEFAULT_SETTINGS);
settings.inbox.releaseAtPlaySeconds = [0, 0, 1800];

async function makeGame(name: string, prefix: string, teams: number) {
  const id = await createSampleGame(prisma, { name, teams, settings });
  const hash = await bcrypt.hash(SCREENSHOT_PASSWORD, 4);
  const rows = await prisma.team.findMany({ where: { gameId: id }, orderBy: { code: 'asc' } });
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  const out = [];
  for (const [i, t] of rows.entries()) {
    const code = `${prefix}${i + 1}${suffix}`;
    await prisma.team.update({
      where: { id: t.id },
      data: { code, name: `Team ${i + 1}`, passwordHash: hash },
    });
    out.push({ id: t.id, code, name: `Team ${i + 1}` });
  }
  return { id, teams: out };
}

try {
  if (command === 'create') {
    const admin = await prisma.staffUser.findUnique({ where: { email: env.ADMIN_SEED_EMAIL } });
    if (!admin) throw new Error('The main admin does not exist yet. Run npm run db:seed first.');
    const a = await makeGame('Screenshot game A', 'SHA', 4);
    const b = await makeGame('Screenshot game B', 'SHB', 3);
    const staffToken = new Tokens(env.JWT_SECRET).signStaff({ staffUserId: admin.id });
    console.log(JSON.stringify({ staffToken, password: SCREENSHOT_PASSWORD, a, b }));
  } else if (command === 'delete') {
    await prisma.game.deleteMany({ where: { id: { in: args } } });
    console.log(JSON.stringify({ deleted: args.length }));
  } else {
    throw new Error('Use "create" or "delete <gameId>..."');
  }
} finally {
  await prisma.$disconnect();
}
