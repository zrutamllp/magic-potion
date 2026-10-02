import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaAdminStore } from '../admin/prismaStore';
import { AdminService } from '../admin/service';
import { PrismaAuthStore } from '../auth/prismaStore';
import { AuthService } from '../auth/service';
import { Tokens } from '../auth/tokens';
import { FakeClock } from '../engine/clock';
import { createSampleGame } from '../engine/dbGame';
import { GameEngine } from '../engine/engine';
import { loadGame } from '../engine/load';
import { PrismaPersistence } from '../engine/persistence/prisma';
import { seededRng } from '../engine/rng';
import type { PrismaClient } from '../generated/prisma/client';
import { connectTestDatabase, testDatabaseUrl } from '../testDatabase';
import { RETENTION_SINCE_FLAG } from './prismaFacts';

// Deleting a played game's data (by hand, and by the scheduled job after a restart) against a
// real Postgres. Runs only with TEST_DATABASE_URL (the Neon "tests" branch).

const url = testDatabaseUrl();
const DAY = 24 * 60 * 60 * 1000;
const SECRET = 'retention-test-secret-that-is-long-enough-1234';

describe.skipIf(!url)('deleting game data in the database', () => {
  let prisma: PrismaClient;
  let adminId: string;
  let adminName: string;
  let sinceBefore: string | null = null;
  const games: string[] = [];

  beforeAll(async () => {
    prisma = await connectTestDatabase(url as string);
    const admin = await prisma.staffUser.findFirst({ where: { role: 'MAIN_ADMIN' } });
    if (!admin) throw new Error('No main admin in the test database. Run npm run db:seed.');
    adminId = admin.id;
    adminName = admin.name;
    const flag = await prisma.systemFlag.findUnique({ where: { key: RETENTION_SINCE_FLAG } });
    sinceBefore = flag?.value ?? null;
    // Deletion "switched on" long ago, so the first-run floor plays no part.
    await prisma.systemFlag.upsert({
      where: { key: RETENTION_SINCE_FLAG },
      create: { key: RETENTION_SINCE_FLAG, value: new Date(0).toISOString() },
      update: { value: new Date(0).toISOString() },
    });
  });

  afterAll(async () => {
    // The flag first, so it is put back even if a step below fails.
    if (sinceBefore === null) {
      await prisma.systemFlag.deleteMany({ where: { key: RETENTION_SINCE_FLAG } });
    } else {
      await prisma.systemFlag.update({
        where: { key: RETENTION_SINCE_FLAG },
        data: { value: sinceBefore },
      });
    }
    if (games.length > 0) await prisma.game.deleteMany({ where: { id: { in: games } } });
    await prisma.gameDeletion.deleteMany({ where: { gameId: { in: games } } });
    await prisma.$disconnect();
  });

  // Every row that belongs to a game, table by table.
  async function rows(gameId: string) {
    const team = { team: { gameId } };
    return {
      settings: await prisma.gameSettings.count({ where: { gameId } }),
      teams: await prisma.team.count({ where: { gameId } }),
      sessions: await prisma.teamSession.count({ where: team }),
      taskContent: await prisma.taskContent.count({ where: { gameId } }),
      teamTasks: await prisma.teamTask.count({ where: team }),
      attempts: await prisma.taskAttempt.count({ where: { teamTask: team } }),
      fragments: await prisma.fragment.count({ where: { gameId } }),
      ledger: await prisma.fundTransaction.count({ where: team }),
      transfers: await prisma.transfer.count({ where: { gameId } }),
      requests: await prisma.fundRequest.count({ where: { gameId } }),
      adjustments: await prisma.fundAdjustmentRequest.count({ where: { gameId } }),
      chat: await prisma.chatMessage.count({ where: { gameId } }),
      inboxItems: await prisma.inboxItem.count({ where: { gameId } }),
      inboxResponses: await prisma.inboxResponse.count({ where: team }),
      potion: await prisma.potionSnapshot.count({ where: { gameId } }),
      assignments: await prisma.staffAssignment.count({ where: { gameId } }),
      audit: await prisma.auditLog.count({ where: { gameId } }),
    };
  }

  // Every other game: the ones already on the branch (older than an hour) and this test's own.
  // Other database test files run at the same time and add and delete their own games, so
  // those are left out.
  async function allOtherGames(except: string) {
    const ids = await prisma.game.findMany({
      where: {
        id: { not: except },
        OR: [{ createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } }, { id: { in: games } }],
      },
      select: { id: true },
    });
    const out: Record<string, Awaited<ReturnType<typeof rows>>> = {};
    for (const { id } of ids) out[id] = await rows(id);
    return out;
  }

  // A game played with something in every table: tasks, hints, transfers, requests, chat,
  // staff changes, a team photo, a login.
  async function playedGame(name: string, clock: FakeClock) {
    const gameId = await createSampleGame(prisma, { name: `${name} ${Date.now()}`, teams: 4 });
    games.push(gameId);
    const engine = new GameEngine({
      ...(await loadGame(prisma, gameId)),
      persistence: new PrismaPersistence(prisma),
      clock,
      rng: seededRng(5),
    });
    const ok = async (p: Promise<{ ok: boolean }>) => expect((await p).ok).toBe(true);
    await ok(engine.startGame(adminId));
    const [a, b, c, d] = Object.values(engine.state.teams);
    if (!a || !b || !c || !d) throw new Error('teams missing');
    const task = Object.values(a.tasks)[0]!;
    await ok(engine.startTask(a.id, task.id));
    await ok(engine.useHint(a.id, task.id));
    await ok(engine.sendFunds(c.id, d.id, 700));
    await ok(engine.requestFunds(d.id, a.id, 300));
    await ok(engine.requestAdjustment({ id: adminId, name: adminName }, c.id, 5_000, 'Test'));
    await ok(engine.adjustFunds(adminId, d.id, -400, 'Test'));
    await ok(engine.sendChat(a.id, 'Secret plan: Purple Falcon'));
    await engine.stop();
    const photoItem = await prisma.inboxItem.findFirst({ where: { gameId, kind: 'PHOTO' } });
    await prisma.inboxResponse.create({
      data: {
        inboxItemId: photoItem!.id,
        teamId: a.id,
        photoUrl: `team-photos/${gameId}.webp`,
      },
    });
    await prisma.teamSession.create({ data: { teamId: a.id, tokenId: `tok-${gameId}` } });
    await prisma.staffAssignment.create({ data: { gameId, staffUserId: adminId, teamId: b.id } });
    await prisma.potionSnapshot.create({
      data: { gameId, kind: 'HALFTIME', completedTeams: 1, totalTeams: 4 },
    });
    return gameId;
  }

  function service(now: () => number, removed: string[]) {
    const store = new PrismaAdminStore(prisma);
    const auth = new AuthService(new PrismaAuthStore(prisma), new Tokens(SECRET));
    return new AdminService({
      store,
      auth,
      now,
      forgetGame: async () => true,
      removeGamePhotos: async (gameId) => {
        const responses = await prisma.inboxResponse.findMany({
          where: { inboxItem: { gameId }, photoUrl: { not: null } },
        });
        removed.push(...responses.map((r) => r.photoUrl!));
        return responses.length;
      },
    });
  }

  it(
    'deletes every row of the game, keeps every other game, and records no personal data',
    { timeout: 240_000 },
    async () => {
      const clock = new FakeClock(Math.floor(Date.now() / 1000) * 1000);
      const gameId = await playedGame('Retention A', clock);
      await playedGame('Retention B', clock);
      const lobby = await createSampleGame(prisma, { name: `Retention C ${Date.now()}`, teams: 3 });
      games.push(lobby);
      await prisma.game.update({
        where: { id: gameId },
        data: { phase: 'REVEAL', endedAt: new Date(clock.now()) },
      });

      const before = await rows(gameId);
      // The game really has something in every table.
      for (const [table, n] of Object.entries(before))
        expect([table, n > 0]).toEqual([table, true]);
      const teams = await prisma.team.findMany({ where: { gameId } });
      const name = (await prisma.game.findUniqueOrThrow({ where: { id: gameId } })).name;
      const others = await allOtherGames(gameId);
      // The branch's own 2 games, this test's game B and the Lobby game C.
      expect(Object.keys(others).length).toBeGreaterThanOrEqual(4);

      const removed: string[] = [];
      const admin = service(() => clock.now(), removed);
      const res = await admin.deleteGame(
        { id: adminId, name: adminName, role: 'MAIN_ADMIN', active: true, email: '' } as never,
        gameId,
        name,
      );
      expect(res.ok).toBe(true);

      expect(await prisma.game.count({ where: { id: gameId } })).toBe(0);
      expect(Object.values(await rows(gameId)).every((n) => n === 0)).toBe(true);
      expect(removed).toEqual([`team-photos/${gameId}.webp`]);
      expect(await allOtherGames(gameId)).toEqual(others);

      const record = await prisma.gameDeletion.findFirstOrThrow({ where: { gameId } });
      expect(record).toMatchObject({ gameName: name, deletedBy: adminId });
      expect(record.counts).toMatchObject({ teams: 4, chatMessages: before.chat, photos: 1 });
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { gameId: null, action: 'DELETE_GAME' },
        orderBy: { createdAt: 'desc' },
      });
      const kept = JSON.stringify([record, audit]);
      expect(kept).not.toContain('Purple Falcon');
      for (const t of teams) {
        expect(kept).not.toContain(t.code);
        expect(kept).not.toContain(t.passwordHash);
      }
    },
  );

  it(
    'after a restart, the scheduled job deletes a game whose days have passed, using only database times',
    { timeout: 240_000 },
    async () => {
      const clock = new FakeClock(Math.floor(Date.now() / 1000) * 1000);
      const due = await playedGame('Retention due', clock);
      const recent = await playedGame('Retention recent', clock);
      const endedLongAgo = new Date(clock.now() - 91 * DAY);
      await prisma.game.update({
        where: { id: due },
        data: { phase: 'REVEAL', endedAt: endedLongAgo },
      });
      await prisma.game.update({
        where: { id: recent },
        data: { phase: 'REVEAL', endedAt: new Date(clock.now()) },
      });

      // A brand-new store and service, as a restarted server builds them: nothing in memory.
      const admin = service(() => clock.now(), []);
      const deleted = await admin.deleteDueGameData({ only: [due, recent] });
      expect(deleted).toEqual([due]);
      expect(await prisma.game.count({ where: { id: due } })).toBe(0);
      expect(await prisma.game.count({ where: { id: recent } })).toBe(1);
      expect(await prisma.gameDeletion.findFirst({ where: { gameId: due } })).toMatchObject({
        deletedBy: 'auto',
      });
    },
  );

  it(
    'shows each played game its deletion date in the games list',
    { timeout: 120_000 },
    async () => {
      const clock = new FakeClock(Math.floor(Date.now() / 1000) * 1000);
      const gameId = await createSampleGame(prisma, {
        name: `Retention list ${Date.now()}`,
        teams: 3,
      });
      games.push(gameId);
      const ended = new Date(clock.now() - DAY);
      await prisma.game.update({
        where: { id: gameId },
        data: { phase: 'REVEAL', startedAt: ended, endedAt: ended },
      });
      const list = await new PrismaAuthStore(prisma).gamesFor({
        id: adminId,
        name: adminName,
        role: 'MAIN_ADMIN',
        active: true,
      } as never);
      expect(list.find((g) => g.id === gameId)).toMatchObject({
        dataDeleteAt: new Date(ended.getTime() + 90 * DAY).toISOString(),
        dataDeleteFrom: 'ended',
      });
    },
  );
});
