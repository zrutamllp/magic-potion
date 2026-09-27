import type { TaskKey } from '@magic-potion/shared';
import { describe, expect, it } from 'vitest';
import { FakeClock } from './clock';
import type { GameEngine } from './engine';
import { memoryEngine } from './memoryGame';
import { correctSubmissions, wrongSubmission } from './solver';
import type { GameState, TeamState } from './state';

const MIN = 60_000;
const T0 = Date.UTC(2026, 8, 27, 9, 0, 0);
const ADMIN = 'admin-1';

async function started(teams = 20) {
  const clock = new FakeClock(T0);
  const { engine, persistence } = memoryEngine({ teams, clock });
  await engine.startGame(ADMIN);
  return { clock, engine, persistence };
}

// A team that drew the given task, and the task id.
function withTask(engine: GameEngine, key: TaskKey): { team: TeamState; taskId: string } {
  for (const team of Object.values(engine.state.teams)) {
    const task = Object.values(team.tasks).find((t) => t.key === key);
    if (task) return { team, taskId: task.id };
  }
  throw new Error(`No team drew ${key}`);
}

function taskOf(engine: GameEngine, teamId: string, taskId: string) {
  const task = engine.state.teams[teamId]?.tasks[taskId];
  if (!task) throw new Error('missing task');
  return task;
}

function team(engine: GameEngine, teamId: string): TeamState {
  const t = engine.state.teams[teamId];
  if (!t) throw new Error('missing team');
  return t;
}

// Tests may set balances directly to reach edge cases quickly.
function setFunds(engine: GameEngine, teamId: string, taskFunds: number, supportFunds: number) {
  const t = (engine.state as GameState).teams[teamId];
  if (!t) throw new Error('missing team');
  t.taskFunds = taskFunds;
  t.supportFunds = supportFunds;
}

async function solve(engine: GameEngine, teamId: string, taskId: string) {
  const subs = correctSubmissions(engine.state, engine.gameContent, teamId, taskId);
  let last;
  for (const s of subs) {
    last = await engine.submit(teamId, taskId, s);
    expect(last.ok).toBe(true);
  }
  return last;
}

describe('starting a task', () => {
  it('starts the task timer on the server', async () => {
    const { engine } = await started();
    const { team: t, taskId } = withTask(engine, 'vault');
    const r = await engine.startTask(t.id, taskId);
    expect(r).toEqual({ ok: true, value: { attempt: 1 } });
    const task = taskOf(engine, t.id, taskId);
    expect(task.status).toBe('IN_PROGRESS');
    expect(task.attempts[0]?.endsAt).toBe(T0 + 12 * MIN);
    const view = engine.teamView(t.id);
    expect(view?.tasks.find((x) => x.id === taskId)?.running?.msLeft).toBe(12 * MIN);
  });

  it('allows only one open task at a time', async () => {
    const { engine } = await started();
    const t = Object.values(engine.state.teams)[0] as TeamState;
    const [a, b] = Object.values(t.tasks);
    await engine.startTask(t.id, a?.id ?? '');
    expect(await engine.startTask(t.id, b?.id ?? '')).toMatchObject({ code: 'ANOTHER_TASK_OPEN' });
    // Starting the same task again does not reset its timer.
    expect(await engine.startTask(t.id, a?.id ?? '')).toMatchObject({ code: 'ANOTHER_TASK_OPEN' });
  });

  it('cannot start in the Lobby, the Pause or while frozen', async () => {
    const clock = new FakeClock(T0);
    const { engine } = memoryEngine({ teams: 3, clock });
    expect(await engine.startTask('team-1', 'x')).toMatchObject({ code: 'WRONG_PHASE' });
    await engine.startGame(ADMIN);
    const t = team(engine, 'team-1');
    const taskId = Object.keys(t.tasks)[0] ?? '';
    await engine.freeze(ADMIN);
    expect(await engine.startTask(t.id, taskId)).toMatchObject({ code: 'GAME_FROZEN' });
  });

  it('is blocked while Task Funds are below zero', async () => {
    const { engine } = await started(3);
    const t = team(engine, 'team-1');
    setFunds(engine, t.id, -1, 4_500);
    expect(await engine.startTask(t.id, Object.keys(t.tasks)[0] ?? '')).toMatchObject({
      code: 'NEGATIVE_FUNDS',
    });
    setFunds(engine, t.id, 0, 4_500);
    expect((await engine.startTask(t.id, Object.keys(t.tasks)[0] ?? '')).ok).toBe(true);
  });
});

describe('solving', () => {
  it('solves The Vault with the clue digits and the fragment from another team', async () => {
    const { engine } = await started(3);
    const { team: t, taskId } = withTask(engine, 'vault');
    await engine.startTask(t.id, taskId);
    const fragment = Object.values(engine.state.fragments).find(
      (f) => f.kind === 'VAULT' && f.neededByTeamId === t.id,
    );
    expect(fragment?.holderTeamId).not.toBe(t.id);
    const code = '836' + (fragment?.value ?? '').replace(/\D/g, '');
    const r = await engine.submit(t.id, taskId, { code });
    expect(r).toMatchObject({ ok: true, value: { status: 'solved' } });
    expect(taskOf(engine, t.id, taskId).status).toBe('DONE');
    expect(await engine.startTask(t.id, taskId)).toMatchObject({ code: 'TASK_ALREADY_DONE' });
  });

  it('shows each team only the fragments it holds', async () => {
    const { engine } = await started(3);
    for (const t of Object.values(engine.state.teams)) {
      const held = Object.values(engine.state.fragments)
        .filter((f) => f.holderTeamId === t.id)
        .map((f) => f.value);
      expect(engine.teamView(t.id)?.foundItems).toEqual(held);
    }
  });

  it('rejects a malformed answer without counting it', async () => {
    const { engine } = await started(3);
    const { team: t, taskId } = withTask(engine, 'vault');
    await engine.startTask(t.id, taskId);
    expect(await engine.submit(t.id, taskId, { code: '12' })).toMatchObject({
      code: 'INVALID_ANSWER',
    });
    expect(taskOf(engine, t.id, taskId).attempts[0]?.wrongCount).toBe(0);
  });

  it('records the time bonus and fills the potion when the 5th task is done', async () => {
    const g = await started(3);
    const t = team(g.engine, 'team-1');
    g.clock.set(T0 + 10 * MIN);
    for (const taskId of Object.keys(t.tasks)) {
      await g.engine.startTask(t.id, taskId);
      await solve(g.engine, t.id, taskId);
    }
    const after = team(g.engine, t.id);
    expect(after.finishedAt).toBe(T0 + 10 * MIN);
    // 25 minutes left in Round 1 plus all of Round 2.
    expect(after.finishPlaySecondsRemaining).toBe(60 * 60);
    expect(g.engine.potion()).toEqual({ completedTeams: 1, totalTeams: 3 });
    const row = g.engine.leaderboard().entries.find((e) => e.teamId === t.id);
    expect(row?.score.timeBonus).toBe(5 * 3_600);
  });

  it('counts extensions in the time bonus', async () => {
    const g = await started(3);
    await g.engine.extendPhase(ADMIN, 300);
    const t = team(g.engine, 'team-1');
    for (const taskId of Object.keys(t.tasks)) {
      await g.engine.startTask(t.id, taskId);
      await solve(g.engine, t.id, taskId);
    }
    expect(team(g.engine, t.id).finishPlaySecondsRemaining).toBe(4_200 + 300);
  });
});

describe('code lockout', () => {
  it('locks The Vault for 60 seconds after 3 wrong codes', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'vault');
    await g.engine.startTask(t.id, taskId);
    for (let i = 0; i < 2; i++) {
      expect(await g.engine.submit(t.id, taskId, { code: '000000' })).toMatchObject({
        value: { status: 'wrong', lockedUntil: null },
      });
    }
    expect(await g.engine.submit(t.id, taskId, { code: '000000' })).toMatchObject({
      value: { status: 'wrong', lockedUntil: T0 + 60_000 },
    });
    g.clock.set(T0 + 59_999);
    expect(await g.engine.submit(t.id, taskId, { code: '000000' })).toMatchObject({
      code: 'LOCKED_OUT',
    });
    g.clock.set(T0 + 60_000);
    expect(await g.engine.submit(t.id, taskId, { code: '000000' })).toMatchObject({
      value: { status: 'wrong', lockedUntil: T0 + 60_000 },
    });
    // The count starts again after a lockout.
    expect(taskOf(g.engine, t.id, taskId).attempts[0]?.wrongCount).toBe(1);
  });

  it('locks longer each time: 60 seconds, 2 minutes, then 4 minutes', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'find_code');
    await g.engine.startTask(t.id, taskId);
    const lockAfter3Wrong = async () => {
      let last: unknown;
      for (let i = 0; i < 3; i++) last = await g.engine.submit(t.id, taskId, { answer: 'nope' });
      return (last as { value: { lockedUntil: number } }).value.lockedUntil - g.clock.now();
    };
    expect(await lockAfter3Wrong()).toBe(60_000);
    g.clock.advance(60_000);
    expect(await lockAfter3Wrong()).toBe(120_000);
    g.clock.advance(120_000);
    expect(await lockAfter3Wrong()).toBe(240_000);
    g.clock.advance(240_000);
    expect(await lockAfter3Wrong()).toBe(240_000);
    expect(taskOf(g.engine, t.id, taskId).attempts[0]?.lockouts).toBe(4);
  });

  it('keeps growing after a restart, so giving up does not reset the lock', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'vault');
    await g.engine.startTask(t.id, taskId);
    for (let i = 0; i < 3; i++) await g.engine.submit(t.id, taskId, { code: '000000' });
    await g.engine.giveUp(t.id, taskId);
    await g.engine.startTask(t.id, taskId);
    let last: unknown;
    for (let i = 0; i < 3; i++) last = await g.engine.submit(t.id, taskId, { code: '000000' });
    expect((last as { value: { lockedUntil: number } }).value.lockedUntil).toBe(T0 + 120_000);
  });

  it('uses the lock lengths from the settings', async () => {
    const clock = new FakeClock(T0);
    const { engine } = memoryEngine({ teams: 3, clock });
    engine.state.settings.tasks.lockoutSeconds = [30];
    await engine.startGame(ADMIN);
    const { team: t, taskId } = withTask(engine, 'vault');
    await engine.startTask(t.id, taskId);
    let last: unknown;
    for (let i = 0; i < 3; i++) last = await engine.submit(t.id, taskId, { code: '000000' });
    expect((last as { value: { lockedUntil: number } }).value.lockedUntil).toBe(T0 + 30_000);
  });

  it('does not lock tasks without a code lockout', async () => {
    const g = await started();
    const { team: t, taskId } = withTask(g.engine, 'riddle');
    await g.engine.startTask(t.id, taskId);
    for (let i = 0; i < 5; i++) {
      const wrong = wrongSubmission(g.engine.state, g.engine.gameContent, t.id, taskId);
      expect(await g.engine.submit(t.id, taskId, wrong)).toMatchObject({
        value: { status: 'wrong', lockedUntil: null },
      });
    }
  });
});

describe('hints', () => {
  it('costs 1,500 from Support Funds', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'vault');
    await g.engine.startTask(t.id, taskId);
    const r = await g.engine.useHint(t.id, taskId);
    expect(r.ok).toBe(true);
    expect(team(g.engine, t.id)).toMatchObject({ supportFunds: 3_000, taskFunds: 10_000 });
  });

  it('allows one hint per attempt', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'vault');
    await g.engine.startTask(t.id, taskId);
    await g.engine.useHint(t.id, taskId);
    expect(await g.engine.useHint(t.id, taskId)).toMatchObject({ code: 'HINT_ALREADY_USED' });
  });

  it('takes what is left in Support Funds first, and the rest from Task Funds', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'vault');
    setFunds(g.engine, t.id, 5_000, 1_000);
    await g.engine.startTask(t.id, taskId);
    expect(await g.engine.useHint(t.id, taskId)).toMatchObject({ ok: true });
    expect(team(g.engine, t.id)).toMatchObject({ supportFunds: 0, taskFunds: 4_500 });
    const ledger = g.persistence.log.filter((c) => c.kind === 'ledger' && c.ledgerKind === 'HINT');
    expect(ledger.map((c) => c.kind === 'ledger' && [c.wallet, c.amount])).toEqual([
      ['SUPPORT', -1_000],
      ['TASK', -500],
    ]);
  });

  it('is blocked if it would take Task Funds below zero', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'vault');
    setFunds(g.engine, t.id, 1_000, 400);
    await g.engine.startTask(t.id, taskId);
    expect(await g.engine.useHint(t.id, taskId)).toMatchObject({
      code: 'NOT_ENOUGH_FUNDS_FOR_HINT',
    });
    setFunds(g.engine, t.id, 1_100, 400);
    expect(await g.engine.useHint(t.id, taskId)).toMatchObject({ ok: true });
    expect(team(g.engine, t.id)).toMatchObject({ supportFunds: 0, taskFunds: 0 });
  });

  it('works only while the timer is running', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'vault');
    expect(await g.engine.useHint(t.id, taskId)).toMatchObject({ code: 'TASK_NOT_RUNNING' });
  });

  it('is not offered for Ethical Dilemma', async () => {
    const g = await started();
    const { team: t, taskId } = withTask(g.engine, 'ethical_dilemma');
    await g.engine.startTask(t.id, taskId);
    expect(await g.engine.useHint(t.id, taskId)).toMatchObject({ code: 'NO_HINT_FOR_TASK' });
  });
});

describe('failing and restarting', () => {
  it('fails when the timer runs out and costs 3,500', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'vault');
    await g.engine.startTask(t.id, taskId);
    g.clock.set(T0 + 12 * MIN);
    await g.engine.tick();
    const task = taskOf(g.engine, t.id, taskId);
    expect(task.status).toBe('FAILED');
    expect(task.attempts[0]).toMatchObject({ result: 'FAILED_TIMEOUT', endedAt: T0 + 12 * MIN });
    expect(team(g.engine, t.id).taskFunds).toBe(6_500);
  });

  it('fails on Give up with the same penalty', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'find_code');
    await g.engine.startTask(t.id, taskId);
    expect((await g.engine.giveUp(t.id, taskId)).ok).toBe(true);
    expect(taskOf(g.engine, t.id, taskId).attempts[0]?.result).toBe('GAVE_UP');
    expect(team(g.engine, t.id).taskFunds).toBe(6_500);
  });

  it('fails Hangman after 6 wrong letters', async () => {
    const g = await started();
    const { team: t, taskId } = withTask(g.engine, 'hangman');
    await g.engine.startTask(t.id, taskId);
    for (let i = 0; i < 6; i++) {
      const wrong = wrongSubmission(g.engine.state, g.engine.gameContent, t.id, taskId);
      await g.engine.submit(t.id, taskId, wrong);
    }
    expect(taskOf(g.engine, t.id, taskId).attempts[0]?.result).toBe('FAILED_WRONG');
    expect(team(g.engine, t.id).taskFunds).toBe(6_500);
  });

  it('restarts with a fresh timer, a fresh hint and a new content variant', async () => {
    const g = await started();
    const { team: t, taskId } = withTask(g.engine, 'riddle');
    await g.engine.startTask(t.id, taskId);
    await g.engine.useHint(t.id, taskId);
    await g.engine.giveUp(t.id, taskId);
    g.clock.set(T0 + 2 * MIN);
    expect(await g.engine.startTask(t.id, taskId)).toEqual({ ok: true, value: { attempt: 2 } });
    const [first, second] = taskOf(g.engine, t.id, taskId).attempts;
    expect(second).toMatchObject({ endsAt: T0 + 10 * MIN, hintsUsed: 0 });
    expect(first?.contentId).toBe('content-riddle-1');
    expect(second?.contentId).toBe('content-riddle-2');
    expect((await g.engine.useHint(t.id, taskId)).ok).toBe(true);
  });

  it('costs 3,500 again on every failure, and Task Funds may go below zero', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'find_code');
    for (let i = 0; i < 3; i++) {
      await g.engine.startTask(t.id, taskId);
      await g.engine.giveUp(t.id, taskId);
    }
    expect(team(g.engine, t.id).taskFunds).toBe(10_000 - 3 * 3_500);
    expect(await g.engine.startTask(t.id, taskId)).toMatchObject({ code: 'NEGATIVE_FUNDS' });
  });

  it('keeps the same Find the Code content on restart', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'find_code');
    await g.engine.startTask(t.id, taskId);
    await g.engine.giveUp(t.id, taskId);
    await g.engine.startTask(t.id, taskId);
    const [a, b] = taskOf(g.engine, t.id, taskId).attempts;
    expect(b?.contentId).toBe(a?.contentId);
  });

  it('lets a running task continue after Task Funds go below zero', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'vault');
    await g.engine.startTask(t.id, taskId);
    setFunds(g.engine, t.id, -500, 0);
    expect((await solve(g.engine, t.id, taskId))?.ok).toBe(true);
  });
});

describe('the Pause and the end of play', () => {
  it('freezes task timers and lockouts in the Pause and resumes with the same time left', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'vault');
    g.clock.set(T0 + 30 * MIN);
    await g.engine.startTask(t.id, taskId); // ends at 42:00
    g.clock.set(T0 + 34 * MIN + 30_000);
    for (let i = 0; i < 3; i++) await g.engine.submit(t.id, taskId, { code: '000000' });
    // Locked until 35:30; 30 seconds of lock remain when the Pause starts at 35:00.
    g.clock.set(T0 + 35 * MIN);
    await g.engine.tick();
    const frozen = taskOf(g.engine, t.id, taskId).attempts[0];
    expect(frozen).toMatchObject({ frozenRemainingMs: 7 * MIN, frozenLockMs: 30_000 });
    expect(g.engine.teamView(t.id)?.tasks.find((x) => x.id === taskId)?.running?.msLeft).toBe(
      7 * MIN,
    );
    g.clock.set(T0 + 45 * MIN);
    await g.engine.tick();
    const resumed = taskOf(g.engine, t.id, taskId).attempts[0];
    expect(resumed).toMatchObject({
      endsAt: T0 + 52 * MIN,
      lockedUntil: T0 + 45 * MIN + 30_000,
      frozenRemainingMs: null,
      frozenLockMs: null,
    });
  });

  it('freezes task timers while the admin has paused the game', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'vault');
    await g.engine.startTask(t.id, taskId);
    g.clock.set(T0 + 2 * MIN);
    await g.engine.freeze(ADMIN);
    g.clock.set(T0 + 30 * MIN);
    await g.engine.tick();
    expect(taskOf(g.engine, t.id, taskId).status).toBe('IN_PROGRESS');
    await g.engine.resume(ADMIN);
    expect(taskOf(g.engine, t.id, taskId).attempts[0]?.endsAt).toBe(T0 + 40 * MIN);
  });

  it('stops a running task at the end of play with no penalty', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'vault');
    g.clock.set(T0 + 45 * MIN);
    await g.engine.tick();
    g.clock.set(T0 + 75 * MIN);
    await g.engine.startTask(t.id, taskId);
    g.clock.set(T0 + 80 * MIN);
    await g.engine.tick();
    expect(g.engine.state.phase).toBe('REVEAL');
    const task = taskOf(g.engine, t.id, taskId);
    expect(task.attempts[0]?.result).toBe('STOPPED_AT_END');
    expect(task.status).toBe('NOT_STARTED');
    expect(team(g.engine, t.id).taskFunds).toBe(10_000);
  });

  it('gives no penalty when a task timer ends exactly when play ends', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'vault');
    g.clock.set(T0 + 45 * MIN);
    await g.engine.tick();
    g.clock.set(T0 + 68 * MIN);
    await g.engine.startTask(t.id, taskId); // 12 minutes: ends at 80:00, the end of play
    g.clock.set(T0 + 80 * MIN);
    await g.engine.tick();
    expect(taskOf(g.engine, t.id, taskId).attempts[0]?.result).toBe('STOPPED_AT_END');
    expect(team(g.engine, t.id).taskFunds).toBe(10_000);
  });
});

describe('public views', () => {
  it('never include the answer of a running task', async () => {
    const g = await started(3);
    const { team: t, taskId } = withTask(g.engine, 'find_code');
    await g.engine.startTask(t.id, taskId);
    const own = Object.values(g.engine.state.fragments).find(
      (f) => f.kind === 'FIND_CODE' && f.neededByTeamId === t.id,
    );
    const cipher = own?.secretData as { word: string } | null;
    const json = JSON.stringify(g.engine.teamView(t.id));
    expect(cipher?.word).toBeTruthy();
    expect(json).not.toContain(cipher?.word);
    expect(json).not.toContain(own?.value);
    expect(json).not.toContain('hiddenKey');
  });
});
