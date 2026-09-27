import { describe, expect, it } from 'vitest';
import { FakeClock } from '../engine/clock';
import { GameEngine } from '../engine/engine';
import { memoryEngine, sampleContent } from '../engine/memoryGame';
import { MemoryPersistence } from '../engine/persistence/memory';
import { seededRng } from '../engine/rng';
import { buildPlayerState, transactionLines } from './views';

const T0 = Date.UTC(2026, 8, 27, 9, 0, 0);
const ADMIN = 'admin-1';
const A = 'team-1';

async function started() {
  const clock = new FakeClock(T0);
  const { engine, persistence } = memoryEngine({ teams: 3, clock });
  await engine.startGame(ADMIN);
  const tasks = Object.values(engine.state.teams[A]!.tasks);
  const vault = tasks.find((t) => t.key === 'vault')!;
  return { clock, engine, persistence, vault };
}

describe('transaction lines', () => {
  it('shows a hint paid from both wallets as one line', async () => {
    const g = await started();
    // Leave 1,000 in Support Funds, so the 1,500 hint takes 500 from Task Funds.
    g.engine.state.teams[A]!.supportFunds = 1_000;
    await g.engine.startTask(A, g.vault.id);
    expect((await g.engine.useHint(A, g.vault.id)).ok).toBe(true);
    expect(transactionLines(g.engine.state, A)).toEqual([
      expect.objectContaining({
        kind: 'HINT',
        taskName: 'The Vault',
        supportFunds: -1_000,
        taskFunds: -500,
        at: T0,
      }),
    ]);
  });

  it('shows fail penalties, newest first, and leaves out start funds and transfers', async () => {
    const g = await started();
    await g.engine.sendFunds(A, 'team-2', 100);
    await g.engine.startTask(A, g.vault.id);
    await g.engine.giveUp(A, g.vault.id);
    g.clock.advance(1_000);
    await g.engine.startTask(A, g.vault.id);
    await g.engine.useHint(A, g.vault.id);
    const lines = transactionLines(g.engine.state, A);
    expect(lines.map((l) => [l.kind, l.taskName, l.taskFunds, l.supportFunds])).toEqual([
      ['HINT', 'The Vault', 0, -1_500],
      ['FAIL_PENALTY', 'The Vault', -3_500, 0],
    ]);
    expect(transactionLines(g.engine.state, 'team-2')).toEqual([]);
  });

  it('keeps the lines after a restart (the ledger is part of the saved state)', async () => {
    const g = await started();
    await g.engine.startTask(A, g.vault.id);
    await g.engine.giveUp(A, g.vault.id);
    const reloaded = new GameEngine({
      state: structuredClone(g.engine.state),
      content: sampleContent(),
      persistence: new MemoryPersistence(),
      clock: g.clock,
      rng: seededRng(2),
    });
    expect(transactionLines(reloaded.state, A)).toHaveLength(1);
    const ledgerChanges = g.persistence.log.filter((c) => c.kind === 'ledger');
    expect(ledgerChanges.every((c) => c.kind === 'ledger' && c.id && c.createdAt === T0)).toBe(
      true,
    );
  });
});

describe('task view', () => {
  it('counts wrong tries and says how the last try ended', async () => {
    const g = await started();
    await g.engine.startTask(A, g.vault.id);
    await g.engine.submit(A, g.vault.id, { code: '000000' });
    let task = buildPlayerState(g.engine, A, g.clock.now()).team.tasks.find(
      (t) => t.id === g.vault.id,
    )!;
    expect(task.running?.wrongCount).toBe(1);
    expect(task.lastResult).toBeNull();
    await g.engine.giveUp(A, g.vault.id);
    task = buildPlayerState(g.engine, A, g.clock.now()).team.tasks.find(
      (t) => t.id === g.vault.id,
    )!;
    expect(task).toMatchObject({ status: 'FAILED', running: null, lastResult: 'GAVE_UP' });
  });
});
