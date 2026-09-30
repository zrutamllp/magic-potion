import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../generated/prisma/client';
import { checkBalances } from '../../ledger/ledger';
import { connectTestDatabase, testDatabaseUrl } from '../../testDatabase';
import { FakeClock } from '../clock';
import { createSampleGame } from '../dbGame';
import { GameEngine } from '../engine';
import { canonicalJson, loadGame } from '../load';
import { seededRng } from '../rng';
import { correctSubmissions } from '../solver';
import { PrismaPersistence } from './prisma';

// Saves a game to a real database, rebuilds it, and checks nothing was lost.
// Runs only when TEST_DATABASE_URL is set (use a Neon branch, not the live database).
// The test game is deleted afterwards.

const url = testDatabaseUrl();
const MIN = 60_000;

describe.skipIf(!url)('Prisma persistence', () => {
  let prisma: PrismaClient;
  let gameId: string;
  let adminId: string;
  let adminName: string;

  beforeAll(async () => {
    prisma = await connectTestDatabase(url as string);
    const admin = await prisma.staffUser.findFirst({ where: { role: 'MAIN_ADMIN' } });
    if (!admin) throw new Error('No main admin in the test database. Run npm run db:seed.');
    adminId = admin.id;
    adminName = admin.name;
    gameId = await createSampleGame(prisma, { name: `Integration test ${Date.now()}`, teams: 4 });
  });

  afterAll(async () => {
    if (gameId) await prisma.game.delete({ where: { id: gameId } });
    await prisma.$disconnect();
  });

  it('rebuilds exactly the state the engine saved', { timeout: 180_000 }, async () => {
    const T0 = Math.floor(Date.now() / 1000) * 1000;
    const clock = new FakeClock(T0);
    const loaded = await loadGame(prisma, gameId);
    const engine = new GameEngine({
      ...loaded,
      persistence: new PrismaPersistence(prisma),
      clock,
      rng: seededRng(7),
    });
    const ok = async (p: Promise<{ ok: boolean }>) => expect((await p).ok).toBe(true);

    await ok(engine.startGame(adminId));
    const [a, b, c] = Object.values(engine.state.teams);
    if (!a || !b || !c) throw new Error('teams missing');
    const [vault, findCode] = Object.values(a.tasks);
    if (!vault || !findCode) throw new Error('tasks missing');

    // A task with a hint, a lockout and a solve.
    await ok(engine.startTask(a.id, vault.id));
    await ok(engine.useHint(a.id, vault.id));
    for (let i = 0; i < 3; i++) await ok(engine.submit(a.id, vault.id, { code: '000000' }));
    clock.advance(MIN);
    for (const s of correctSubmissions(engine.state, engine.gameContent, a.id, vault.id)) {
      await ok(engine.submit(a.id, vault.id, s));
    }
    // A give-up with its penalty.
    await ok(engine.startTask(a.id, findCode.id));
    await ok(engine.giveUp(a.id, findCode.id));
    // Funds, a request, chat, an inbox answer and a photo reject.
    await ok(engine.sendFunds(a.id, b.id, 1_234));
    const req = await engine.requestFunds(b.id, c.id, 500);
    if (!req.ok) throw new Error(req.code);
    await ok(engine.acceptRequest(c.id, req.value.requestId));
    // Two chat messages, a second apart so the reload keeps their order.
    await ok(engine.sendChat(a.id, 'Who holds 4-2-9?'));
    clock.advance(1_000);
    await ok(engine.sendChat(b.id, 'We do!'));
    clock.set(T0 + 10 * MIN);
    await engine.tick();
    const photo = Object.values(engine.state.inboxItems).find((i) => i.kind === 'PHOTO');
    await ok(engine.submitPhoto(b.id, photo?.id ?? '', 'https://example.com/team.jpg'));
    await ok(engine.rejectPhoto(adminId, b.id, photo?.id ?? '', 'Not the whole team'));
    // Facilitator actions (Phase 6C): a fund change, an approved request, a rename and its
    // undo, a message and a released fragment.
    await ok(engine.adjustFunds(adminId, c.id, -700, 'Integration test'));
    const adj = await engine.requestAdjustment(
      { id: adminId, name: adminName },
      a.id,
      3_000,
      'Integration test',
    );
    if (!adj.ok) throw new Error(adj.code);
    await ok(engine.decideAdjustment(adminId, adj.value.requestId, true));
    await ok(engine.renameTeam(adminId, c.id, `Renamed ${T0}`));
    const rename = await prisma.auditLog.findFirstOrThrow({
      where: { gameId, action: 'RENAME_TEAM' },
    });
    await ok(
      engine.undo(
        adminId,
        {
          id: rename.id,
          action: rename.action,
          teamId: rename.teamId,
          before: rename.before as { name: string },
          after: rename.after as { name: string },
          undoneAt: null,
          undoOfId: null,
        },
        '',
      ),
    );
    await ok(engine.postMessage(adminId, 'Integration test', 'Hello'));
    const fragment = Object.values(engine.state.fragments).find((f) => f.neededByTeamId === c.id);
    await ok(engine.releaseFragment(adminId, fragment?.id ?? ''));
    // An admin pause, resume and extension.
    await ok(engine.freeze(adminId));
    clock.advance(2 * MIN);
    await ok(engine.resume(adminId));
    await ok(engine.extendPhase(adminId, 30));
    // A task and a transfer still running when the Pause starts.
    await ok(engine.startTask(b.id, Object.keys(b.tasks)[0] ?? ''));
    clock.set(T0 + 37 * MIN + 30_000 - 20_000);
    await ok(engine.sendFunds(c.id, a.id, 50));
    clock.set(T0 + 38 * MIN);
    await engine.tick();
    expect(engine.state.phase).toBe('PAUSE');

    const rebuilt = await loadGame(prisma, gameId);
    expect(canonicalJson(rebuilt.state)).toBe(canonicalJson(engine.state));
    expect(await checkBalances(prisma, gameId)).toEqual([]);
    expect(
      (await prisma.auditLog.findUniqueOrThrow({ where: { id: rename.id } })).undoneAt,
    ).not.toBeNull();

    // The rebuilt engine carries on: Round 2 starts when the Pause ends.
    const restarted = new GameEngine({
      ...rebuilt,
      persistence: new PrismaPersistence(prisma),
      clock,
      rng: seededRng(8),
    });
    clock.set(T0 + 50 * MIN);
    await restarted.tick();
    expect(restarted.state.phase).toBe('ROUND2');
    expect(restarted.state.phaseStartedAt).toBe(T0 + 47 * MIN + 30_000);
    const again = await loadGame(prisma, gameId);
    expect(canonicalJson(again.state)).toBe(canonicalJson(restarted.state));
  });
});
