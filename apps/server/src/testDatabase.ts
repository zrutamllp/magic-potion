import { createPrisma } from './db';
import type { PrismaClient } from './generated/prisma/client';
import { assertNotProduction } from './safety';

// The database tests (Phase 7A) run only against a separate Neon branch in TEST_DATABASE_URL.
// They create and delete games, so they refuse the branch the app uses (DATABASE_URL) and any
// database marked as production.

export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = env['TEST_DATABASE_URL'];
  if (!url) return undefined;
  const mainHost = env['MAIN_DATABASE_HOST'];
  if (mainHost && new URL(url).host === mainHost) {
    throw new Error(
      'TEST_DATABASE_URL points at the same Neon branch as DATABASE_URL. Use a separate "tests" branch.',
    );
  }
  return url;
}

export async function connectTestDatabase(url: string): Promise<PrismaClient> {
  const prisma = createPrisma(url);
  await assertNotProduction(prisma, 'The database test');
  return prisma;
}
