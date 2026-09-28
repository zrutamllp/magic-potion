import { describe, expect, it } from 'vitest';
import { FakeClock } from '../engine/clock';
import { GameEngine } from '../engine/engine';
import { memoryEngine, sampleContent } from '../engine/memoryGame';
import { MemoryPersistence } from '../engine/persistence/memory';
import { seededRng } from '../engine/rng';
import { buildPlayerState, buildStaffState, transactionLines } from './views';

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
    expect(transactionLines(g.engine.state, g.engine.gameContent, A)).toEqual([
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
    const lines = transactionLines(g.engine.state, g.engine.gameContent, A);
    expect(lines.map((l) => [l.kind, l.taskName, l.taskFunds, l.supportFunds])).toEqual([
      ['HINT', 'The Vault', 0, -1_500],
      ['FAIL_PENALTY', 'The Vault', -3_500, 0],
    ]);
    expect(transactionLines(g.engine.state, g.engine.gameContent, 'team-2')).toEqual([]);
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
    expect(transactionLines(reloaded.state, reloaded.gameContent, A)).toHaveLength(1);
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

describe('Vault marker', () => {
  it('shows the Vault its marker, and the digits only to the holder', async () => {
    const g = await started();
    await g.engine.startTask(A, g.vault.id);
    const needed = Object.values(g.engine.state.fragments).find(
      (f) => f.kind === 'VAULT' && f.neededByTeamId === A,
    )!;
    const state = buildPlayerState(g.engine, A, g.clock.now());
    const view = state.team.tasks.find((t) => t.id === g.vault.id)?.running?.view as {
      marker: string;
    };
    expect(needed.value).toMatch(/^\S+ \d-\d-\d$/);
    expect(view.marker).toBe(needed.value.split(' ')[0]);
    expect(JSON.stringify(state)).not.toContain(needed.value);
    // The holder sees the whole fragment as a Found item, with no team name.
    const holder = buildPlayerState(g.engine, needed.holderTeamId, g.clock.now());
    expect(holder.team.foundItems).toContain(needed.value);
  });
});

describe('staff fragment list', () => {
  it('is only sent when dev tools are on', async () => {
    const g = await started();
    const admin = {
      id: ADMIN,
      name: 'Admin',
      email: 'a@x',
      role: 'MAIN_ADMIN' as const,
      active: true,
      passwordHash: '',
    };
    const on = buildStaffState(g.engine, admin, null, () => false, true, g.clock.now());
    const off = buildStaffState(g.engine, admin, null, () => false, false, g.clock.now());
    expect(on.devFragments).toHaveLength(6);
    expect(off.devFragments).toBeNull();
  });
});

describe('dev Ethical Dilemma answers', () => {
  it('lists saved answers for the main admin with dev tools on only', async () => {
    const clock = new FakeClock(T0);
    const { engine } = memoryEngine({ teams: 20, clock });
    await engine.startGame(ADMIN);
    const team = Object.values(engine.state.teams).find((t) =>
      Object.values(t.tasks).some((x) => x.key === 'ethical_dilemma'),
    )!;
    const task = Object.values(team.tasks).find((x) => x.key === 'ethical_dilemma')!;
    await engine.startTask(team.id, task.id);
    await engine.submit(team.id, task.id, { choice: 0, reason: 'Kept my word.' });

    const account = {
      id: ADMIN,
      name: 'Admin',
      email: 'a@x',
      role: 'MAIN_ADMIN' as const,
      active: true,
      passwordHash: '',
    };
    const on = buildStaffState(engine, account, null, () => false, true, clock.now());
    expect(on.devDilemmaAnswers).toEqual([
      {
        teamName: team.name,
        option: 'Say nothing. It is your colleague’s news to tell.',
        reason: 'Kept my word.',
      },
    ]);
    const off = buildStaffState(engine, account, null, () => false, false, clock.now());
    expect(off.devDilemmaAnswers).toBeNull();
    const cofac = { ...account, role: 'CO_FACILITATOR' as const };
    expect(
      buildStaffState(engine, cofac, null, () => false, true, clock.now()).devDilemmaAnswers,
    ).toBeNull();
  });
});
