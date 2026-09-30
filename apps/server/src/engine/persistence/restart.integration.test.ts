import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import { checkBalances } from '../../ledger/ledger';
import { connectTestDatabase, testDatabaseUrl } from '../../testDatabase';
import { FakeClock } from '../clock';
import { createSampleGame } from '../dbGame';
import { GameEngine } from '../engine';
import { canonicalJson, loadGame } from '../load';
import { EngineRegistry } from '../registry';
import { seededRng } from '../rng';
import { MemoryPersistence } from './memory';
import { PrismaPersistence } from './prisma';

// A server restart in the middle of a game (Render restarts on every deploy and crash).
// Everything is rebuilt from the database the way the server does it on start, and must
// match the game as it was: timers, funds, fragments and everything still to happen.
// Runs only with TEST_DATABASE_URL (a separate Neon branch). Test games are deleted afterwards.

const url = testDatabaseUrl();
const MIN = 60_000;

describe.skipIf(!url)('restarting the server mid-game', () => {
  let prisma: PrismaClient;
  let adminId: string;
  let adminName: string;
  const games: string[] = [];
  const registries: EngineRegistry[] = [];

  beforeAll(async () => {
    prisma = await connectTestDatabase(url as string);
    const admin = await prisma.staffUser.findFirst({ where: { role: 'MAIN_ADMIN' } });
    if (!admin) throw new Error('No main admin in the test database. Run npm run db:seed.');
    adminId = admin.id;
    adminName = admin.name;
  });

  afterAll(async () => {
    await Promise.all(registries.map((r) => r.stop()));
    if (games.length > 0) await prisma.game.deleteMany({ where: { id: { in: games } } });
    await prisma.$disconnect();
  });

  // A game in the middle of Round 1 with something of every kind going on.
  async function busyGame(clock: FakeClock) {
    const gameId = await createSampleGame(prisma, { name: `Restart test ${Date.now()}`, teams: 4 });
    games.push(gameId);
    const engine = new GameEngine({
      ...(await loadGame(prisma, gameId)),
      persistence: new PrismaPersistence(prisma),
      clock,
      rng: seededRng(11),
    });
    const ok = async (p: Promise<{ ok: boolean }>) => expect((await p).ok).toBe(true);
    const T0 = clock.now();
    await ok(engine.startGame(adminId));
    const [a, b, c, d] = Object.values(engine.state.teams);
    if (!a || !b || !c || !d) throw new Error('teams missing');
    const vault = Object.values(a.tasks).find((t) => t.key === 'vault');
    const other = Object.values(b.tasks)[2];
    if (!vault || !other) throw new Error('tasks missing');

    // A hint and a code lockout on a running task.
    await ok(engine.startTask(a.id, vault.id));
    await ok(engine.useHint(a.id, vault.id));
    for (let i = 0; i < 3; i++) await ok(engine.submit(a.id, vault.id, { code: '000000' }));
    // Another team's running task timer.
    clock.set(T0 + MIN);
    await ok(engine.startTask(b.id, other.id));
    // The admin pauses and resumes: every timer moves on by the paused time.
    clock.set(T0 + 2 * MIN);
    await ok(engine.freeze(adminId));
    clock.set(T0 + 3 * MIN);
    await ok(engine.resume(adminId));
    // Funds in transit, a request waiting, a co-facilitator change waiting, chat, a fragment.
    await ok(engine.sendFunds(c.id, d.id, 700));
    await ok(engine.requestFunds(d.id, a.id, 300));
    await ok(engine.requestAdjustment({ id: adminId, name: adminName }, c.id, 5_000, 'Test'));
    await ok(engine.adjustFunds(adminId, d.id, -400, 'Test'));
    await ok(engine.sendChat(a.id, 'Hello'));
    const fragment = Object.values(engine.state.fragments).find((f) => f.neededByTeamId === d.id);
    await ok(engine.releaseFragment(adminId, fragment?.id ?? ''));
    clock.set(T0 + 3 * MIN + 20_000);
    await engine.tick();
    return { gameId, engine, T0 };
  }

  // What the server does on start: a fresh registry rebuilds the game from the database.
  async function restart(gameId: string, clock: FakeClock) {
    const registry = new EngineRegistry(prisma, clock);
    registries.push(registry);
    return registry.get(gameId);
  }

  // The same game carried on in memory, as if the server had never restarted.
  function noRestart(engine: GameEngine, clock: FakeClock) {
    return new GameEngine({
      state: structuredClone(engine.state),
      content: engine.gameContent,
      persistence: new MemoryPersistence(),
      clock,
      rng: seededRng(12),
    });
  }

  it(
    'rebuilds timers, funds and fragments exactly, and carries on the same',
    { timeout: 240_000 },
    async () => {
      const clock = new FakeClock(Math.floor(Date.now() / 1000) * 1000);
      const { gameId, engine, T0 } = await busyGame(clock);
      const reference = noRestart(engine, clock);

      const rebuilt = await restart(gameId, clock);
      expect(canonicalJson(rebuilt.state)).toBe(canonicalJson(engine.state));
      // Every timer still due: transfer arrival, task timeouts, lock end, inbox, round end.
      expect(rebuilt.nextDueAt()).toBe(engine.nextDueAt());
      expect(await checkBalances(prisma, gameId)).toEqual([]);
      for (const id of Object.keys(engine.state.teams)) {
        expect(rebuilt.teamView(id)?.foundItems).toEqual(engine.teamView(id)?.foundItems);
        expect(rebuilt.teamView(id)?.tasks).toEqual(engine.teamView(id)?.tasks);
      }

      // After the restart, things fall due at the same moments as without it.
      for (const at of [T0 + 5 * MIN, T0 + 14 * MIN, T0 + 16 * MIN, T0 + 30 * MIN]) {
        clock.set(at);
        await rebuilt.tick();
        await reference.tick();
        expect(canonicalJson(rebuilt.state)).toBe(canonicalJson(reference.state));
      }
      // The transfer arrived and the running tasks timed out, as they would have.
      const transfer = Object.values(rebuilt.state.transfers)[0];
      expect(transfer?.arrivedAt).not.toBeNull();
      expect(
        Object.values(rebuilt.state.teams).flatMap((t) =>
          Object.values(t.tasks).flatMap((x) => x.attempts.map((a) => a.result)),
        ),
      ).toContain('FAILED_TIMEOUT');
      // And the database agrees with memory.
      const reloaded = await loadGame(prisma, gameId);
      expect(canonicalJson(reloaded.state)).toBe(canonicalJson(rebuilt.state));
      expect(await checkBalances(prisma, gameId)).toEqual([]);
    },
  );

  it(
    'keeps everything still when restarted while the admin has paused',
    { timeout: 240_000 },
    async () => {
      const clock = new FakeClock(Math.floor(Date.now() / 1000) * 1000 + 10 * MIN);
      const { gameId, engine, T0 } = await busyGame(clock);
      await engine.freeze(adminId);
      const frozen = canonicalJson(engine.state);

      clock.set(T0 + 60 * MIN);
      const rebuilt = await restart(gameId, clock);
      await rebuilt.tick();
      expect(rebuilt.nextDueAt()).toBeNull();
      expect(canonicalJson(rebuilt.state)).toBe(frozen);
      // Resumed later, the time left is exactly what it was at the pause.
      await rebuilt.resume(adminId);
      const reference = noRestart(engine, clock);
      await reference.resume(adminId);
      expect(rebuilt.nextDueAt()).toBe(reference.nextDueAt());
    },
  );
});
