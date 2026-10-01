import bcrypt from 'bcrypt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSampleGame } from '../engine/dbGame';
import type { PrismaClient } from '../generated/prisma/client';
import { connectTestDatabase, testDatabaseUrl } from '../testDatabase';
import { PrismaAuthStore } from './prismaStore';
import { AuthService } from './service';
import { Tokens } from './tokens';

// 25 teams log in at the same moment against a real database (Phase 7C, Round B), twice.
// Every login works and every team ends with exactly one open session. Runs only when
// TEST_DATABASE_URL is set; the test game is deleted afterwards.

const url = testDatabaseUrl();
const TEAMS = 25;

describe.skipIf(!url)('a login storm on the database', () => {
  let prisma: PrismaClient;
  let gameId: string;
  const logins = Array.from({ length: TEAMS }, (_, i) => ({
    code: `STORM${Date.now().toString(36).slice(-4).toUpperCase()}${i}`,
    password: `storm-pass-${i}`,
  }));

  beforeAll(async () => {
    prisma = await connectTestDatabase(url as string);
    const teams = await Promise.all(
      logins.map(async (l, i) => ({
        code: l.code,
        name: `Storm ${i + 1}`,
        passwordHash: await bcrypt.hash(l.password, 4),
      })),
    );
    gameId = await createSampleGame(prisma, { name: `Login storm test ${Date.now()}`, teams });
  });

  afterAll(async () => {
    if (gameId) await prisma.game.delete({ where: { id: gameId } });
    await prisma.$disconnect();
  });

  it('logs every team in, twice, with one open session each', { timeout: 120_000 }, async () => {
    const auth = new AuthService(new PrismaAuthStore(prisma), new Tokens('x'.repeat(48)));
    for (let round = 0; round < 2; round++) {
      const results = await Promise.all(logins.map((l) => auth.loginTeam(l, '10.0.0.2')));
      expect(results.filter((r) => !r.ok)).toEqual([]);
    }
    const open = await prisma.teamSession.groupBy({
      by: ['teamId'],
      where: { team: { gameId }, endedAt: null },
      _count: true,
    });
    expect(open).toHaveLength(TEAMS);
    expect(open.every((o) => o._count === 1)).toBe(true);
  });
});
