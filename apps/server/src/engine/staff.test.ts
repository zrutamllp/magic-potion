import { describe, expect, it } from 'vitest';
import { FakeClock } from './clock';
import type { Change } from './draft';
import type { GameEngine } from './engine';
import { memoryEngine } from './memoryGame';
import type { UndoTarget } from './rules/staff';
import { buildPlayerState } from '../realtime/views';
import { teamView } from './views';

// Facilitator actions during a live game (GAME_RULES section 11, Phase 6C).

const MIN = 60_000;
const T0 = Date.UTC(2026, 8, 29, 9, 0, 0);
const ADMIN = 'admin-1';
const COFAC = { id: 'cofac-1', name: 'Asha' };
const [A, B, C] = ['team-1', 'team-2', 'team-3'];

async function started() {
  const clock = new FakeClock(T0);
  const { engine, persistence } = memoryEngine({ teams: 3, clock });
  await engine.startGame(ADMIN);
  return { clock, engine, persistence };
}

function team(engine: GameEngine, teamId: string) {
  const t = engine.state.teams[teamId];
  if (!t) throw new Error('missing team');
  return t;
}

function vaultId(engine: GameEngine, teamId: string): string {
  const task = Object.values(team(engine, teamId).tasks).find((t) => t.key === 'vault');
  if (!task) throw new Error('no vault');
  return task.id;
}

function audits(log: readonly Change[]) {
  return log.flatMap((c) =>
    c.kind === 'create' && c.model === 'auditLog' ? [c.data as Record<string, unknown>] : [],
  );
}

// The audit row as the HTTP layer would read it back from the database.
function target(log: readonly Change[], action: string): UndoTarget {
  const row = audits(log)
    .filter((a) => a.action === action)
    .at(-1);
  if (!row) throw new Error(`no ${action} row`);
  return {
    id: row.id as string,
    action,
    teamId: row.teamId as string,
    before: row.before as UndoTarget['before'],
    after: row.after as UndoTarget['after'],
    undoneAt: null,
    undoOfId: null,
  };
}

function score(engine: GameEngine, teamId: string) {
  return engine.leaderboard().entries.find((e) => e.teamId === teamId);
}

describe('fund adjustments', () => {
  it('changes Task Funds, is audited, and links the ledger row to the audit row', async () => {
    const g = await started();
    expect(await g.engine.adjustFunds(ADMIN, A, 1_000, 'Great debrief answer')).toMatchObject({
      ok: true,
    });
    expect(team(g.engine, A).taskFunds).toBe(11_000);
    const audit = target(g.persistence.log, 'ADJUST_FUNDS');
    expect(audits(g.persistence.log).at(-1)).toMatchObject({
      staffUserId: ADMIN,
      teamId: A,
      before: { taskFunds: 10_000 },
      after: { taskFunds: 11_000, amount: 1_000 },
      reason: 'Great debrief answer',
    });
    const ledger = Object.values(g.engine.state.ledger).find((l) => l.kind === 'STAFF_ADJUST');
    expect(ledger).toMatchObject({
      teamId: A,
      wallet: 'TASK',
      amount: 1_000,
      auditLogId: audit.id,
    });
  });

  it('moves the score through Task Funds only, never as funds given or received', async () => {
    const g = await started();
    const before = score(g.engine, A);
    await g.engine.adjustFunds(ADMIN, A, -2_000, 'Broke a rule');
    const after = score(g.engine, A);
    expect(after?.fundsGiven).toBe(0);
    expect(after?.fundsReceived).toBe(0);
    expect((after?.score.total ?? 0) - (before?.score.total ?? 0)).toBe(-4_000);
  });

  it('may take Task Funds below zero, which blocks starting a task until they recover', async () => {
    const g = await started();
    await g.engine.adjustFunds(ADMIN, A, -10_500, 'Test');
    expect(team(g.engine, A).taskFunds).toBe(-500);
    expect(await g.engine.startTask(A, vaultId(g.engine, A))).toMatchObject({
      code: 'NEGATIVE_FUNDS',
    });
    await g.engine.adjustFunds(ADMIN, A, 500, 'Back to zero');
    expect((await g.engine.startTask(A, vaultId(g.engine, A))).ok).toBe(true);
  });

  it('shows players the amount only, never who made it or why', async () => {
    const g = await started();
    await g.engine.adjustFunds(ADMIN, A, 1_000, 'Secret reason');
    const json = JSON.stringify(buildPlayerState(g.engine, A, T0));
    expect(json).toContain('STAFF_ADJUST');
    expect(json).not.toContain(ADMIN);
    expect(json).not.toContain('Secret reason');
  });

  it('needs a whole non-zero amount, a reason and a running game', async () => {
    const g = await started();
    expect(await g.engine.adjustFunds(ADMIN, A, 0, 'x')).toMatchObject({
      code: 'INVALID_ADJUSTMENT',
    });
    expect(await g.engine.adjustFunds(ADMIN, A, 1.5, 'x')).toMatchObject({
      code: 'INVALID_ADJUSTMENT',
    });
    expect(await g.engine.adjustFunds(ADMIN, A, 100, '  ')).toMatchObject({
      code: 'REASON_REQUIRED',
    });
    expect(await g.engine.adjustFunds(ADMIN, 'nobody', 100, 'x')).toMatchObject({
      code: 'TEAM_NOT_FOUND',
    });
    await g.engine.removeTeam(ADMIN, C, 'Left');
    expect(await g.engine.adjustFunds(ADMIN, C, 100, 'x')).toMatchObject({
      code: 'TEAM_REMOVED',
    });
    const lobby = memoryEngine({ teams: 3, clock: new FakeClock(T0) });
    expect(await lobby.engine.adjustFunds(ADMIN, A, 100, 'x')).toMatchObject({
      code: 'WRONG_PHASE',
    });
  });

  it('is not allowed once the Reveal has started (scores are final)', async () => {
    const g = await started();
    for (let i = 0; i < 3; i++) await g.engine.endPhase(ADMIN);
    expect(g.engine.state.phase).toBe('REVEAL');
    expect(await g.engine.adjustFunds(ADMIN, A, 100, 'x')).toMatchObject({ code: 'WRONG_PHASE' });
  });
});

describe('adjustment requests (co-facilitator above the limit)', () => {
  it('waits for the admin and changes nothing until approved', async () => {
    const g = await started();
    const r = await g.engine.requestAdjustment(COFAC, A, 3_000, 'Lost a round to a bug');
    expect(r.ok).toBe(true);
    expect(team(g.engine, A).taskFunds).toBe(10_000);
    const requestId = r.ok ? r.value.requestId : '';
    expect(g.engine.state.adjustments[requestId]).toMatchObject({
      status: 'PENDING',
      requestedByName: 'Asha',
      amount: 3_000,
    });
    // The staff name is not a column of the request row.
    const created = g.persistence.log.find(
      (c) => c.kind === 'create' && c.model === 'fundAdjustmentRequest',
    );
    expect(created && 'data' in created && created.data).not.toHaveProperty('requestedByName');

    expect(await g.engine.decideAdjustment(ADMIN, requestId, true)).toMatchObject({ ok: true });
    expect(team(g.engine, A).taskFunds).toBe(13_000);
    expect(g.engine.state.adjustments[requestId]).toMatchObject({
      status: 'APPROVED',
      decidedById: ADMIN,
      decidedAt: T0,
    });
    expect(audits(g.persistence.log).at(-1)).toMatchObject({
      action: 'ADJUST_FUNDS',
      staffUserId: ADMIN,
      after: { amount: 3_000, requestId, requestedById: COFAC.id },
    });
    expect(await g.engine.decideAdjustment(ADMIN, requestId, false)).toMatchObject({
      code: 'ADJUSTMENT_CLOSED',
    });
  });

  it('can be rejected, with no change to funds', async () => {
    const g = await started();
    const r = await g.engine.requestAdjustment(COFAC, A, -5_000, 'x');
    const requestId = r.ok ? r.value.requestId : '';
    await g.engine.decideAdjustment(ADMIN, requestId, false, 'Too much');
    expect(team(g.engine, A).taskFunds).toBe(10_000);
    expect(g.engine.state.adjustments[requestId]?.status).toBe('REJECTED');
    expect(audits(g.persistence.log).at(-1)).toMatchObject({
      action: 'REJECT_ADJUSTMENT',
      reason: 'Too much',
    });
    expect(await g.engine.decideAdjustment(ADMIN, 'nope', true)).toMatchObject({
      code: 'ADJUSTMENT_NOT_FOUND',
    });
  });
});

describe('live rename', () => {
  it('renames a team; players see the new name everywhere', async () => {
    const g = await started();
    expect(await g.engine.renameTeam(ADMIN, A, '  Dragons  ')).toMatchObject({ ok: true });
    expect(team(g.engine, A).name).toBe('Dragons');
    expect(buildPlayerState(g.engine, B, T0)?.teams.map((t) => t.name)).toContain('Dragons');
    expect(audits(g.persistence.log).at(-1)).toMatchObject({
      action: 'RENAME_TEAM',
      before: { name: 'Team 1' },
      after: { name: 'Dragons' },
    });
  });

  it('refuses a name another team has, or an empty one', async () => {
    const g = await started();
    expect(await g.engine.renameTeam(ADMIN, A, 'team 2')).toMatchObject({ code: 'NAME_TAKEN' });
    expect(await g.engine.renameTeam(ADMIN, A, ' ')).toMatchObject({ code: 'INVALID_NAME' });
  });
});

describe('unlocking a task (admin)', () => {
  async function lockedVault() {
    const g = await started();
    const taskId = vaultId(g.engine, A);
    await g.engine.startTask(A, taskId);
    for (let i = 0; i < 3; i++) await g.engine.submit(A, taskId, { code: '000000' });
    expect(await g.engine.submit(A, taskId, { code: '000000' })).toMatchObject({
      code: 'LOCKED_OUT',
    });
    return { ...g, taskId };
  }

  it('clears a code lockout at once', async () => {
    const g = await lockedVault();
    expect(await g.engine.clearLockout(ADMIN, A, g.taskId)).toMatchObject({ ok: true });
    expect(await g.engine.submit(A, g.taskId, { code: '000000' })).toMatchObject({
      value: { status: 'wrong' },
    });
    expect(audits(g.persistence.log).some((a) => a.action === 'CLEAR_LOCKOUT')).toBe(true);
    // Earlier locks still count: the next one lasts 2 minutes.
    await g.engine.submit(A, g.taskId, { code: '000000' });
    expect(await g.engine.submit(A, g.taskId, { code: '000000' })).toMatchObject({
      value: { lockedUntil: T0 + 2 * MIN },
    });
  });

  it('refuses when the task is not locked or not running', async () => {
    const g = await started();
    const taskId = vaultId(g.engine, A);
    expect(await g.engine.clearLockout(ADMIN, A, taskId)).toMatchObject({
      code: 'TASK_NOT_RUNNING',
    });
    await g.engine.startTask(A, taskId);
    expect(await g.engine.clearLockout(ADMIN, A, taskId)).toMatchObject({ code: 'NOT_LOCKED' });
  });

  it('clears a lock that is frozen in the Pause', async () => {
    const g = await lockedVault();
    await g.engine.freeze(ADMIN);
    expect(await g.engine.clearLockout(ADMIN, A, g.taskId)).toMatchObject({ ok: true });
    await g.engine.resume(ADMIN);
    expect(await g.engine.submit(A, g.taskId, { code: '000000' })).toMatchObject({
      value: { status: 'wrong' },
    });
  });

  it('stops a running task with no penalty; it is not done and can start again', async () => {
    const g = await started();
    const taskId = vaultId(g.engine, A);
    await g.engine.startTask(A, taskId);
    expect(await g.engine.stopTask(ADMIN, A, taskId, 'Opened by mistake')).toMatchObject({
      ok: true,
    });
    const t = team(g.engine, A);
    expect(t.taskFunds).toBe(10_000);
    expect(t.tasks[taskId]?.status).toBe('NOT_STARTED');
    expect(t.tasks[taskId]?.attempts[0]?.result).toBe('STOPPED_BY_STAFF');
    const view = teamView(g.engine.state, g.engine.gameContent, A, T0);
    expect(view?.tasks.find((x) => x.id === taskId)?.lastResult).toBe('STOPPED_BY_STAFF');
    // Other tasks unlock, and this one starts again.
    expect((await g.engine.startTask(A, taskId)).ok).toBe(true);
  });

  it('keeps a failed task as Failed when a later try is stopped', async () => {
    const g = await started();
    const taskId = vaultId(g.engine, A);
    await g.engine.startTask(A, taskId);
    await g.engine.giveUp(A, taskId);
    await g.engine.startTask(A, taskId);
    await g.engine.stopTask(ADMIN, A, taskId, '');
    expect(team(g.engine, A).tasks[taskId]?.status).toBe('FAILED');
    expect(team(g.engine, A).taskFunds).toBe(10_000 - 3_500);
  });
});

describe('releasing a missing team fragment', () => {
  it('gives the fragment to the team that needs it, once', async () => {
    const g = await started();
    const fragment = Object.values(g.engine.state.fragments).find((f) => f.neededByTeamId === A);
    if (!fragment) throw new Error('no fragment');
    const before = g.engine.teamView(A)?.foundItems.length ?? 0;
    expect(await g.engine.releaseFragment(ADMIN, fragment.id)).toMatchObject({
      ok: true,
      value: { teamId: A },
    });
    expect(g.engine.teamView(A)?.foundItems.length).toBe(before + 1);
    expect(g.engine.state.fragments[fragment.id]).toMatchObject({
      releasedAt: T0,
      releasedByStaffId: ADMIN,
    });
    // The audit row never holds the fragment value.
    expect(JSON.stringify(audits(g.persistence.log).at(-1))).not.toContain(fragment.value);
    expect(await g.engine.releaseFragment(ADMIN, fragment.id)).toMatchObject({
      code: 'FRAGMENT_ALREADY_RELEASED',
    });
    expect(await g.engine.releaseFragment(ADMIN, 'nope')).toMatchObject({
      code: 'FRAGMENT_NOT_FOUND',
    });
  });
});

describe('facilitator messages', () => {
  it('reach every team inbox as an alert', async () => {
    const g = await started();
    const r = await g.engine.postMessage(ADMIN, 'Heads up', 'Ten minutes to the Pause.');
    expect(r.ok).toBe(true);
    for (const id of [A, B, C]) {
      expect(buildPlayerState(g.engine, id, T0)?.inbox.at(-1)).toMatchObject({
        kind: 'ALERT',
        title: 'Heads up',
        body: 'Ten minutes to the Pause.',
      });
    }
    // Messages are not deduplicated like round alerts.
    expect((await g.engine.postMessage(ADMIN, 'Heads up', 'Again')).ok).toBe(true);
    expect(await g.engine.postMessage(ADMIN, ' ', 'x')).toMatchObject({ code: 'MESSAGE_EMPTY' });
  });
});

describe('undo', () => {
  it('reverses a fund adjustment with an UNDO line and marks the original undone', async () => {
    const g = await started();
    await g.engine.adjustFunds(ADMIN, A, 1_500, 'Oops');
    const original = target(g.persistence.log, 'ADJUST_FUNDS');
    expect(await g.engine.undo(ADMIN, original, '')).toMatchObject({ ok: true });
    expect(team(g.engine, A).taskFunds).toBe(10_000);
    const undo = audits(g.persistence.log).at(-1);
    expect(undo).toMatchObject({ action: 'UNDO', undoOfId: original.id, teamId: A });
    const line = Object.values(g.engine.state.ledger).find((l) => l.kind === 'UNDO');
    expect(line).toMatchObject({ amount: -1_500, auditLogId: undo?.id });
    expect(g.persistence.log).toContainEqual({
      kind: 'update',
      model: 'auditLog',
      id: original.id,
      data: { undoneAt: T0 },
    });
  });

  it('restores the old name, unless the team was renamed again since', async () => {
    const g = await started();
    await g.engine.renameTeam(ADMIN, A, 'Dragons');
    const first = target(g.persistence.log, 'RENAME_TEAM');
    await g.engine.renameTeam(ADMIN, A, 'Phoenix');
    expect(await g.engine.undo(ADMIN, first, '')).toMatchObject({ code: 'UNDO_OUT_OF_DATE' });
    const second = target(g.persistence.log, 'RENAME_TEAM');
    expect(await g.engine.undo(ADMIN, second, '')).toMatchObject({ ok: true });
    expect(team(g.engine, A).name).toBe('Dragons');
  });

  it('refuses rows that were undone already, undo rows, and other actions', async () => {
    const g = await started();
    await g.engine.adjustFunds(ADMIN, A, 100, 'x');
    const row = target(g.persistence.log, 'ADJUST_FUNDS');
    expect(await g.engine.undo(ADMIN, { ...row, undoneAt: T0 }, '')).toMatchObject({
      code: 'ALREADY_UNDONE',
    });
    expect(await g.engine.undo(ADMIN, { ...row, undoOfId: 'x' }, '')).toMatchObject({
      code: 'NOTHING_TO_UNDO',
    });
    expect(await g.engine.undo(ADMIN, { ...row, action: 'PAUSE_GAME' }, '')).toMatchObject({
      code: 'NOTHING_TO_UNDO',
    });
  });
});

describe('last activity', () => {
  it('records the time of each team action, not of refused ones', async () => {
    const g = await started();
    expect(team(g.engine, A).lastActionAt).toBeNull();
    g.clock.set(T0 + MIN);
    await g.engine.sendChat(A, 'hello');
    expect(team(g.engine, A).lastActionAt).toBe(T0 + MIN);
    g.clock.set(T0 + 2 * MIN);
    await g.engine.sendFunds(A, B, 999_999);
    expect(team(g.engine, A).lastActionAt).toBe(T0 + MIN);
    await g.engine.markSeen(A);
    expect(team(g.engine, A).lastActionAt).toBe(T0 + 2 * MIN);
    expect(team(g.engine, B).lastActionAt).toBeNull();
  });
});
