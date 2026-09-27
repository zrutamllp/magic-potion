import { describe, expect, it } from 'vitest';
import { FakeClock } from './clock';
import { memoryEngine } from './memoryGame';
import { playSecondsRemaining } from './playClock';

const MIN = 60_000;
const T0 = Date.UTC(2026, 8, 27, 9, 0, 0);
const ADMIN = 'admin-1';

async function started(teams = 4) {
  const clock = new FakeClock(T0);
  const { engine, persistence } = memoryEngine({ teams, clock });
  const r = await engine.startGame(ADMIN);
  expect(r.ok).toBe(true);
  return { clock, engine, persistence };
}

async function at(ctx: { clock: FakeClock; engine: { tick(): Promise<void> } }, ms: number) {
  ctx.clock.set(ms);
  await ctx.engine.tick();
}

describe('starting the game', () => {
  it('moves to Round 1 with a 35-minute timer', async () => {
    const { engine } = await started();
    expect(engine.state.phase).toBe('ROUND1');
    expect(engine.state.phaseStartedAt).toBe(T0);
    expect(engine.state.phaseEndsAt).toBe(T0 + 35 * MIN);
  });

  it('locks the scoring settings', async () => {
    const { engine, persistence } = await started();
    expect(engine.state.scoringLockedAt).toBe(T0);
    expect(persistence.log.some((c) => c.kind === 'lockScoring')).toBe(true);
  });

  it('gives every team 5 tasks, both wallets and a chain position', async () => {
    const { engine } = await started(6);
    const positions = new Set<number | null>();
    for (const team of Object.values(engine.state.teams)) {
      const tasks = Object.values(team.tasks);
      expect(tasks.map((t) => t.key).slice(0, 2)).toEqual(['vault', 'find_code']);
      expect(tasks.filter((t) => t.type === 'UNIQUE')).toHaveLength(3);
      expect(tasks.every((t) => t.status === 'NOT_STARTED')).toBe(true);
      expect(team.taskFunds).toBe(10_000);
      expect(team.supportFunds).toBe(4_500);
      positions.add(team.chainPosition);
    }
    expect([...positions].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('writes START ledger rows for both wallets', async () => {
    const { persistence } = await started(3);
    const starts = persistence.log.filter((c) => c.kind === 'ledger' && c.ledgerKind === 'START');
    expect(starts).toHaveLength(6);
  });

  it('creates one Vault and one Find the Code fragment per team', async () => {
    const { engine } = await started(5);
    const fragments = Object.values(engine.state.fragments);
    expect(fragments.filter((f) => f.kind === 'VAULT')).toHaveLength(5);
    expect(fragments.filter((f) => f.kind === 'FIND_CODE')).toHaveLength(5);
  });

  it('audits the start', async () => {
    const { persistence } = await started();
    const audits = persistence.log.filter((c) => c.kind === 'create' && c.model === 'auditLog');
    expect(audits).toHaveLength(1);
    expect(audits[0]?.kind === 'create' && audits[0].data['action']).toBe('START_GAME');
  });

  it('needs at least 3 teams and can only start once', async () => {
    const clock = new FakeClock(T0);
    const { engine } = memoryEngine({ teams: 2, clock });
    expect(await engine.startGame(ADMIN)).toMatchObject({ ok: false, code: 'NOT_ENOUGH_TEAMS' });
    const game = await started();
    expect(await game.engine.startGame(ADMIN)).toMatchObject({ ok: false, code: 'WRONG_PHASE' });
  });
});

describe('phase timers', () => {
  it('runs Round 1, Pause, Round 2 and Reveal on their own', async () => {
    const g = await started();
    await at(g, T0 + 35 * MIN);
    expect(g.engine.state.phase).toBe('PAUSE');
    expect(g.engine.state.phaseEndsAt).toBe(T0 + 45 * MIN);
    expect(g.engine.state.playMsBeforePhase).toBe(35 * MIN);
    expect(g.engine.state.potionSnapshots.HALFTIME).toEqual({ completedTeams: 0, totalTeams: 4 });
    await at(g, T0 + 45 * MIN);
    expect(g.engine.state.phase).toBe('ROUND2');
    await at(g, T0 + 80 * MIN);
    expect(g.engine.state.phase).toBe('REVEAL');
    expect(g.engine.state.playMsBeforePhase).toBe(70 * MIN);
    expect(g.engine.state.potionSnapshots.FINAL).toEqual({ completedTeams: 0, totalTeams: 4 });
  });

  it('catches up on missed phases at their own times (restart safety)', async () => {
    const g = await started();
    await at(g, T0 + 50 * MIN);
    expect(g.engine.state.phase).toBe('ROUND2');
    // Round 2 started when the Pause ended, not when the server woke up.
    expect(g.engine.state.phaseStartedAt).toBe(T0 + 45 * MIN);
    expect(g.engine.state.phaseEndsAt).toBe(T0 + 80 * MIN);
  });

  it('releases inbox tasks at 10, 30 and 55 minutes of play', async () => {
    const g = await started();
    const released = () =>
      Object.values(g.engine.state.inboxItems)
        .filter((i) => i.releasedAt !== null)
        .map((i) => i.releasedAt);
    await at(g, T0 + 10 * MIN - 1);
    expect(released()).toEqual([]);
    await at(g, T0 + 31 * MIN);
    expect(released()).toEqual([T0 + 10 * MIN, T0 + 30 * MIN]);
    // 55 minutes of play is 20 minutes into Round 2, after the 10-minute Pause.
    await at(g, T0 + 70 * MIN);
    expect(released()).toEqual([T0 + 10 * MIN, T0 + 30 * MIN, T0 + 65 * MIN]);
  });
});

describe('admin controls', () => {
  it('pause and resume push the phase end back by the paused time', async () => {
    const g = await started();
    g.clock.set(T0 + 5 * MIN);
    expect((await g.engine.freeze(ADMIN)).ok).toBe(true);
    const s = () => g.engine.state;
    // Nothing moves while frozen, even past the old end time.
    await at(g, T0 + 40 * MIN);
    expect(s().phase).toBe('ROUND1');
    expect(playSecondsRemaining(s(), g.clock.now(), s().settings.phases)).toBe(65 * 60);
    expect((await g.engine.resume(ADMIN)).ok).toBe(true);
    expect(s().phaseEndsAt).toBe(T0 + 70 * MIN);
    expect(s().frozenAt).toBeNull();
    await at(g, T0 + 70 * MIN);
    expect(s().phase).toBe('PAUSE');
  });

  it('refuses to pause twice or resume when not paused', async () => {
    const g = await started();
    expect(await g.engine.resume(ADMIN)).toMatchObject({ ok: false, code: 'NOT_FROZEN' });
    await g.engine.freeze(ADMIN);
    expect(await g.engine.freeze(ADMIN)).toMatchObject({ ok: false, code: 'ALREADY_FROZEN' });
  });

  it('extends a round and counts it as play time', async () => {
    const g = await started();
    expect((await g.engine.extendPhase(ADMIN, 120)).ok).toBe(true);
    expect(g.engine.state.phaseEndsAt).toBe(T0 + 37 * MIN);
    expect(g.engine.state.extensionSeconds).toBe(120);
    expect(playSecondsRemaining(g.engine.state, T0, g.engine.state.settings.phases)).toBe(72 * 60);
  });

  it('extends the Pause without adding play time', async () => {
    const g = await started();
    await at(g, T0 + 35 * MIN);
    await g.engine.extendPhase(ADMIN, 60);
    expect(g.engine.state.phaseEndsAt).toBe(T0 + 46 * MIN);
    expect(g.engine.state.extensionSeconds).toBe(0);
  });

  it('rejects an extension that is not a whole positive number', async () => {
    const g = await started();
    expect(await g.engine.extendPhase(ADMIN, 0)).toMatchObject({ code: 'INVALID_EXTENSION' });
    expect(await g.engine.extendPhase(ADMIN, 1.5)).toMatchObject({ code: 'INVALID_EXTENSION' });
  });

  it('ends phases early and then ends the game at the Reveal', async () => {
    const g = await started();
    g.clock.set(T0 + 20 * MIN);
    await g.engine.endPhase(ADMIN);
    expect(g.engine.state.phase).toBe('PAUSE');
    expect(g.engine.state.playMsBeforePhase).toBe(20 * MIN);
    await g.engine.endPhase(ADMIN);
    await g.engine.endPhase(ADMIN);
    expect(g.engine.state.phase).toBe('REVEAL');
    expect(g.engine.state.endedAt).toBeNull();
    await g.engine.endPhase(ADMIN);
    expect(g.engine.state.endedAt).toBe(T0 + 20 * MIN);
    expect(await g.engine.endPhase(ADMIN)).toMatchObject({ ok: false, code: 'WRONG_PHASE' });
  });

  it('removes a team from the potion', async () => {
    const g = await started(4);
    const [first] = Object.keys(g.engine.state.teams);
    expect((await g.engine.removeTeam(ADMIN, first ?? '', 'Left early')).ok).toBe(true);
    expect(g.engine.potion()).toEqual({ completedTeams: 0, totalTeams: 3 });
    expect(await g.engine.removeTeam(ADMIN, first ?? '', 'again')).toMatchObject({
      code: 'TEAM_REMOVED',
    });
  });
});

describe('saving', () => {
  it('leaves the state unchanged when the database save fails', async () => {
    const clock = new FakeClock(T0);
    const { engine, persistence } = memoryEngine({ teams: 4, clock });
    persistence.failNext = true;
    await expect(engine.startGame(ADMIN)).rejects.toThrow('Simulated database failure');
    expect(engine.state.phase).toBe('LOBBY');
    expect(Object.values(engine.state.teams).every((t) => t.taskFunds === 0)).toBe(true);
    // The engine keeps working after a failure.
    expect((await engine.startGame(ADMIN)).ok).toBe(true);
  });
});
