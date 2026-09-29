import {
  MIN_TEAMS,
  TASK_DEFINITIONS,
  TaskKeySchema,
  parseTaskContent,
  type TaskKey,
} from '@magic-potion/shared';
import {
  UNIQUE_TASK_KEYS,
  buildFragments,
  chainOrder,
  drawTasks,
  pickContent,
} from '../assignment';
import type { Json } from '../checkers';
import { fail, ok, type Draft } from '../draft';
import { isPlayPhase, phasePlayMs } from '../playClock';
import { activeTeams, runningAttempt } from '../state';
import type { EngineResult } from '@magic-potion/shared';
import { postAlert } from './alerts';
import { freezeTimers, potionOf, unfreezeTimers, unfreezeTransfers } from './timers';

const SORT_ORDER = Object.fromEntries(TASK_DEFINITIONS.map((t) => [t.key, t.sortOrder])) as Record<
  TaskKey,
  number
>;

// The game state machine (GAME_RULES section 2):
// Lobby -> Round 1 -> Pause -> Round 2 -> Reveal. Each timed phase moves on by itself
// when its timer runs out. The admin can also end a phase early, pause, resume or extend it.

function clockAudit(d: Draft) {
  const g = d.state;
  return { phase: g.phase, phaseEndsAt: g.phaseEndsAt, frozenAt: g.frozenAt };
}

export function startGame(d: Draft, staffUserId: string): EngineResult {
  if (d.state.phase !== 'LOBBY') return fail('WRONG_PHASE');
  const teams = activeTeams(d.state).sort((a, b) => a.code.localeCompare(b.code));
  if (teams.length < MIN_TEAMS) return fail('NOT_ENOUGH_TEAMS');

  const byKey = d.content.byKey;
  const vault = byKey.vault?.[0];
  const findCodeVariants = byKey.find_code ?? [];
  const availableUnique = UNIQUE_TASK_KEYS.filter((k) => (byKey[k]?.length ?? 0) > 0);
  if (!vault || findCodeVariants.length === 0 || availableUnique.length < 3) {
    return fail('MISSING_CONTENT');
  }
  // Find the Code always uses its first variant: its word list and symbols make each team's cipher.
  const findCode = byKey.find_code?.find(
    (c) => c.id === pickContent('find_code', findCodeVariants, []).id,
  );
  if (!findCode) return fail('MISSING_CONTENT');
  const findCodeSecret = parseTaskContent(TaskKeySchema.parse('find_code'), findCode)
    .secretData as Parameters<typeof buildFragments>[2];

  const before = clockAudit(d);
  const at = d.now;
  const { settings } = d;
  d.lockScoring();

  const order = chainOrder(
    d.rng,
    teams.map((t) => t.id),
  );
  order.forEach((teamId, position) => {
    const team = d.team(teamId);
    if (team) d.updateTeam(team, { chainPosition: position });
  });
  for (const plan of buildFragments(d.rng, order, findCodeSecret)) {
    d.createFragment({
      ...plan,
      secretData: plan.secretData as Json | null,
      releasedAt: null,
      releasedByStaffId: null,
    });
  }

  // Tasks are kept in list order (common first), the same order the database loads them in.
  // Rows of one kind are written together so the database can save them in one batch.
  for (const team of teams) {
    const keys = drawTasks(d.rng, availableUnique).sort((a, b) => SORT_ORDER[a] - SORT_ORDER[b]);
    for (const key of keys) {
      d.createTeamTask(team, {
        key,
        type: UNIQUE_TASK_KEYS.includes(key) ? 'UNIQUE' : 'COMMON',
        status: 'NOT_STARTED',
        completedAt: null,
      });
    }
  }
  for (const team of teams) {
    d.ledger(team, 'TASK', settings.funds.taskFundsStart, 'START');
    d.ledger(team, 'SUPPORT', settings.funds.supportFundsStart, 'START');
  }

  d.updateGame({
    phase: 'ROUND1',
    phaseStartedAt: at,
    phaseEndsAt: at + settings.phases.round1Seconds * 1000,
    frozenAt: null,
    playMsBeforePhase: 0,
    startedAt: at,
  });
  d.audit({ staffUserId, action: 'START_GAME', before, after: clockAudit(d) });
  d.emit({ type: 'phaseChanged', phase: 'ROUND1', at });
  postAlert(d, 'ROUND1_START');
  return ok(undefined);
}

// Moves to the next phase at d.now. Used by the phase timer and by the admin.
export function advancePhase(d: Draft): void {
  const g = d.state;
  const at = d.now;
  const phases = d.settings.phases;
  switch (g.phase) {
    case 'ROUND1': {
      const playMs = g.playMsBeforePhase + phasePlayMs(g, at);
      d.savePotionSnapshot('HALFTIME', potionOf(g));
      freezeTimers(d);
      d.updateGame({
        phase: 'PAUSE',
        phaseStartedAt: at,
        phaseEndsAt: at + phases.pauseSeconds * 1000,
        frozenAt: null,
        playMsBeforePhase: playMs,
      });
      break;
    }
    case 'PAUSE':
      d.updateGame({
        phase: 'ROUND2',
        phaseStartedAt: at,
        phaseEndsAt: at + phases.round2Seconds * 1000,
        frozenAt: null,
      });
      unfreezeTimers(d);
      break;
    case 'ROUND2': {
      const playMs = g.playMsBeforePhase + phasePlayMs(g, at);
      stopRunningTasks(d);
      // Transfers in transit when play ends still arrive and count.
      unfreezeTransfers(d);
      d.updateGame({
        phase: 'REVEAL',
        phaseStartedAt: at,
        phaseEndsAt: null,
        frozenAt: null,
        playMsBeforePhase: playMs,
      });
      d.savePotionSnapshot('FINAL', potionOf(g));
      break;
    }
    case 'LOBBY':
    case 'REVEAL':
      return;
  }
  d.emit({ type: 'phaseChanged', phase: d.state.phase, at });
  const alert = ({ PAUSE: 'PAUSE_START', ROUND2: 'ROUND2_START', REVEAL: 'PLAY_OVER' } as const)[
    d.state.phase as 'PAUSE' | 'ROUND2' | 'REVEAL'
  ];
  if (alert) postAlert(d, alert);
}

// When play ends, a running task stops with no penalty and does not count as done.
function stopRunningTasks(d: Draft): void {
  for (const team of Object.values(d.state.teams)) {
    for (const task of Object.values(team.tasks)) {
      const attempt = runningAttempt(task);
      if (!attempt) continue;
      stopAttempt(d, task, attempt);
      d.emit({ type: 'taskEnded', teamId: team.id, key: task.key, result: 'STOPPED_AT_END' });
    }
  }
}

// Ends a try with no penalty. It does not count as done, and the team may start it again.
export function stopAttempt(
  d: Draft,
  task: Parameters<Draft['updateTeamTask']>[0],
  attempt: Parameters<Draft['updateAttempt']>[0],
  result: 'STOPPED_AT_END' | 'STOPPED_BY_STAFF' = 'STOPPED_AT_END',
): void {
  d.updateAttempt(attempt, {
    result,
    endedAt: d.now,
    frozenRemainingMs: null,
    frozenLockMs: null,
  });
  const failedBefore = task.attempts.some(
    (a) => a !== attempt && a.result !== 'STOPPED_AT_END' && a.result !== 'STOPPED_BY_STAFF',
  );
  d.updateTeamTask(task, { status: failedBefore ? 'FAILED' : 'NOT_STARTED' });
}

export function endPhase(d: Draft, staffUserId: string): EngineResult {
  const g = d.state;
  if (g.phase === 'LOBBY') return fail('WRONG_PHASE');
  const before = clockAudit(d);
  if (g.phase === 'REVEAL') {
    if (g.endedAt !== null) return fail('WRONG_PHASE');
    d.updateGame({ endedAt: d.now });
    d.emit({ type: 'gameEnded', at: d.now });
  } else {
    advancePhase(d);
  }
  d.audit({ staffUserId, action: 'END_PHASE', before, after: clockAudit(d) });
  return ok(undefined);
}

function hasTimer(d: Draft): boolean {
  return isPlayPhase(d.state.phase) || d.state.phase === 'PAUSE';
}

export function freezeGame(d: Draft, staffUserId: string): EngineResult {
  if (!hasTimer(d)) return fail('WRONG_PHASE');
  if (d.state.frozenAt !== null) return fail('ALREADY_FROZEN');
  const before = clockAudit(d);
  d.updateGame({ frozenAt: d.now });
  freezeTimers(d);
  d.audit({ staffUserId, action: 'PAUSE_GAME', before, after: clockAudit(d) });
  d.emit({ type: 'frozen', at: d.now });
  return ok(undefined);
}

export function resumeGame(d: Draft, staffUserId: string): EngineResult {
  const g = d.state;
  if (g.frozenAt === null) return fail('NOT_FROZEN');
  const before = clockAudit(d);
  const shift = d.now - g.frozenAt;
  d.updateGame({
    frozenAt: null,
    phaseStartedAt: g.phaseStartedAt === null ? null : g.phaseStartedAt + shift,
    phaseEndsAt: g.phaseEndsAt === null ? null : g.phaseEndsAt + shift,
  });
  // In the Pause phase everything stays frozen until Round 2 starts.
  if (isPlayPhase(g.phase)) unfreezeTimers(d);
  d.audit({ staffUserId, action: 'RESUME_GAME', before, after: clockAudit(d) });
  d.emit({ type: 'resumed', at: d.now });
  return ok(undefined);
}

export function extendPhase(d: Draft, staffUserId: string, seconds: number): EngineResult {
  if (!Number.isInteger(seconds) || seconds <= 0) return fail('INVALID_EXTENSION');
  const g = d.state;
  if (!hasTimer(d) || g.phaseEndsAt === null) return fail('WRONG_PHASE');
  const before = { ...clockAudit(d), extensionSeconds: g.extensionSeconds };
  d.updateGame({
    phaseEndsAt: g.phaseEndsAt + seconds * 1000,
    // Only round extensions add play time (GAME_RULES section 9).
    extensionSeconds: isPlayPhase(g.phase) ? g.extensionSeconds + seconds : g.extensionSeconds,
  });
  d.audit({
    staffUserId,
    action: 'EXTEND_PHASE',
    before,
    after: { ...clockAudit(d), extensionSeconds: g.extensionSeconds },
  });
  d.emit({ type: 'extended', seconds });
  return ok(undefined);
}

// Removing a team recalculates the potion over the remaining teams (GAME_RULES section 8).
export function removeTeam(
  d: Draft,
  staffUserId: string,
  teamId: string,
  reason: string,
): EngineResult {
  const team = d.team(teamId);
  if (!team) return fail('TEAM_NOT_FOUND');
  if (team.status === 'REMOVED') return fail('TEAM_REMOVED');
  if (d.state.phase === 'REVEAL') return fail('WRONG_PHASE');
  const potionBefore = potionOf(d.state);
  for (const task of Object.values(team.tasks)) {
    const attempt = runningAttempt(task);
    if (attempt) stopAttempt(d, task, attempt);
  }
  for (const r of Object.values(d.state.requests)) {
    const involved = r.requesterTeamId === teamId || r.payerTeamId === teamId;
    if (involved && r.status === 'PENDING') {
      d.updateRequest(r, { status: 'CANCELLED', decidedAt: d.now });
      d.emit({ type: 'requestDecided', requestId: r.id });
    }
  }
  d.updateTeam(team, { status: 'REMOVED', removedAt: d.now });
  d.audit({
    staffUserId,
    action: 'REMOVE_TEAM',
    teamId,
    before: { status: 'ACTIVE' },
    after: { status: 'REMOVED' },
    reason,
  });
  d.emit({ type: 'teamRemoved', teamId });
  const potion = potionOf(d.state);
  if (
    potion.completedTeams !== potionBefore.completedTeams ||
    potion.totalTeams !== potionBefore.totalTeams
  ) {
    d.emit({ type: 'potionChanged', potion });
  }
  return ok(undefined);
}
