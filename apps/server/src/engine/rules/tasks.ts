import {
  LOCKOUT_TASK_KEYS,
  NO_HINT_TASK_KEYS,
  TASKS_PER_TEAM,
  type AttemptResult,
  type FindCodeCipher,
  type EngineResult,
  type TaskKey,
} from '@magic-potion/shared';
import { pickContent } from '../assignment';
import {
  applyHint,
  checkSubmission,
  initProgress,
  publicView,
  type CheckerContext,
  type Json,
  type SubmitResult,
} from '../checkers';
import { fail, ok, type Draft } from '../draft';
import { playSecondsRemaining, timersRunning } from '../playClock';
import type { Rng } from '../rng';
import {
  openTask,
  runningAttempt,
  tasksDone,
  type AttemptState,
  type GameContent,
  type GameState,
  type TeamState,
  type TeamTaskState,
} from '../state';
import { potionOf } from './timers';

// Task lifecycle (GAME_RULES section 3): start, hint, submit, lockout, fail, restart.

const FRAGMENT_KIND: Partial<Record<TaskKey, 'VAULT' | 'FIND_CODE'>> = {
  vault: 'VAULT',
  find_code: 'FIND_CODE',
};

export function checkerContext(
  state: GameState,
  content: GameContent,
  team: TeamState,
  task: TeamTaskState,
  attempt: AttemptState,
  rng: Rng,
): CheckerContext<TaskKey> {
  const c = content.byId[attempt.contentId];
  if (!c) throw new Error(`Missing content ${attempt.contentId}`);
  const kind = FRAGMENT_KIND[task.key];
  const fragment = kind
    ? Object.values(state.fragments).find((f) => f.kind === kind && f.neededByTeamId === team.id)
    : undefined;
  return {
    publicData: c.publicData,
    secretData: c.secretData,
    fragment: fragment?.value ?? null,
    cipher:
      task.key === 'find_code' ? ((fragment?.secretData ?? null) as FindCodeCipher | null) : null,
    tasks: state.settings.tasks,
    rng,
    previous: task.attempts
      .filter((a) => a.id !== attempt.id && a.contentId === attempt.contentId)
      .map((a) => a.progress),
  } as CheckerContext<TaskKey>;
}

interface Found {
  team: TeamState;
  task: TeamTaskState;
}

function findTask(d: Draft, teamId: string, taskId: string): EngineResult<Found> {
  const team = d.team(teamId);
  if (!team) return fail('TEAM_NOT_FOUND');
  if (team.status !== 'ACTIVE') return fail('TEAM_REMOVED');
  const task = team.tasks[taskId];
  if (!task) return fail('TASK_NOT_FOUND');
  return ok({ team, task });
}

function playCheck(d: Draft): EngineResult<null> {
  if (d.state.phase !== 'ROUND1' && d.state.phase !== 'ROUND2') return fail('WRONG_PHASE');
  if (!timersRunning(d.state)) return fail('GAME_FROZEN');
  return ok(null);
}

function findRunning(d: Draft, teamId: string, taskId: string) {
  const play = playCheck(d);
  if (!play.ok) return play;
  const found = findTask(d, teamId, taskId);
  if (!found.ok) return found;
  const attempt = runningAttempt(found.value.task);
  if (!attempt) return fail('TASK_NOT_RUNNING');
  return ok({ ...found.value, attempt });
}

export function startTask(
  d: Draft,
  teamId: string,
  taskId: string,
): EngineResult<{ attempt: number }> {
  const play = playCheck(d);
  if (!play.ok) return play;
  const found = findTask(d, teamId, taskId);
  if (!found.ok) return found;
  const { team, task } = found.value;
  if (task.status === 'DONE') return fail('TASK_ALREADY_DONE');
  // Only one task can be open at a time.
  if (openTask(team)) return fail('ANOTHER_TASK_OPEN');
  if (team.taskFunds < 0) return fail('NEGATIVE_FUNDS');

  const variants = d.content.byKey[task.key] ?? [];
  const content = pickContent(
    task.key,
    variants,
    task.attempts.map((a) => a.contentId),
  );
  const attempt = d.createAttempt(task, {
    number: task.attempts.length + 1,
    contentId: content.id,
    startedAt: d.now,
    endsAt: d.now + (d.settings.tasks.timerSeconds[task.key] ?? 0) * 1000,
    frozenRemainingMs: null,
    frozenLockMs: null,
    hintsUsed: 0,
    wrongCount: 0,
    lockouts: 0,
    lockedUntil: null,
    progress: {},
    result: null,
    endedAt: null,
  });
  const progress = initProgress(
    task.key,
    checkerContext(d.state, d.content, team, task, attempt, d.rng),
  );
  d.updateAttempt(attempt, { progress });
  d.updateTeamTask(task, { status: 'IN_PROGRESS' });
  d.emit({ type: 'taskStarted', teamId, key: task.key, attempt: attempt.number });
  return ok({ attempt: attempt.number });
}

// The hint cost comes from Support Funds first, and the rest from Task Funds.
// Blocked if it would take Task Funds below zero.
export function useHint(d: Draft, teamId: string, taskId: string): EngineResult<{ view: Json }> {
  const found = findRunning(d, teamId, taskId);
  if (!found.ok) return found;
  const { team, task, attempt } = found.value;
  if (NO_HINT_TASK_KEYS.includes(task.key)) return fail('NO_HINT_FOR_TASK');
  if (attempt.hintsUsed >= d.settings.tasks.hintsPerAttempt) return fail('HINT_ALREADY_USED');
  const cost = d.settings.tasks.hintCost;
  const fromSupport = Math.min(Math.max(team.supportFunds, 0), cost);
  const fromTask = cost - fromSupport;
  if (team.taskFunds - fromTask < 0) return fail('NOT_ENOUGH_FUNDS_FOR_HINT');

  d.ledger(team, 'SUPPORT', -fromSupport, 'HINT', { taskAttemptId: attempt.id });
  d.ledger(team, 'TASK', -fromTask, 'HINT', { taskAttemptId: attempt.id });
  const ctx = checkerContext(d.state, d.content, team, task, attempt, d.rng);
  d.updateAttempt(attempt, {
    hintsUsed: attempt.hintsUsed + 1,
    progress: applyHint(task.key, ctx, attempt.progress),
  });
  d.emit({ type: 'hintUsed', teamId, key: task.key, fromSupport, fromTask });
  return ok({ view: publicView(task.key, ctx, attempt.progress) });
}

export interface SubmitOutcome {
  status: SubmitResult<Json>['status'];
  lockedUntil: number | null;
  view: Json;
}

export function submitAnswer(
  d: Draft,
  teamId: string,
  taskId: string,
  submission: unknown,
): EngineResult<SubmitOutcome> {
  const found = findRunning(d, teamId, taskId);
  if (!found.ok) return found;
  const { team, task, attempt } = found.value;
  if (attempt.lockedUntil !== null && d.now < attempt.lockedUntil) return fail('LOCKED_OUT');

  const ctx = checkerContext(d.state, d.content, team, task, attempt, d.rng);
  const result = checkSubmission(task.key, ctx, attempt.progress, submission);
  if (result.status === 'invalid') return fail('INVALID_ANSWER');
  d.emit({ type: 'taskChecked', teamId, key: task.key, status: result.status });

  switch (result.status) {
    case 'wrong':
      recordWrong(d, team, task, attempt, result.progress);
      break;
    case 'correct':
      d.updateAttempt(attempt, { progress: result.progress });
      break;
    case 'solved':
      d.updateAttempt(attempt, { progress: result.progress });
      solveTask(d, team, task, attempt);
      break;
    case 'failed':
      d.updateAttempt(attempt, { progress: result.progress });
      failTask(d, team, task, attempt, 'FAILED_WRONG');
      break;
  }
  return ok({
    status: result.status,
    lockedUntil: attempt.lockedUntil,
    view: publicView(task.key, ctx, attempt.progress),
  });
}

// How long the next lock on this task lasts. Locks on earlier tries count too, so giving up
// does not reset it. The last length in the setting repeats (GAME_RULES section 3).
export function nextLockSeconds(task: TeamTaskState, lengths: readonly number[]): number {
  const locksSoFar = task.attempts.reduce((sum, a) => sum + a.lockouts, 0);
  return lengths[Math.min(locksSoFar, lengths.length - 1)] ?? 60;
}

// The Vault, Find the Code and Escape Room lock after 3 wrong attempts: 60 seconds the first
// time, then 2 minutes, then 4 minutes each time (all settings).
function recordWrong(
  d: Draft,
  team: TeamState,
  task: TeamTaskState,
  attempt: AttemptState,
  progress: Json,
): void {
  if (!LOCKOUT_TASK_KEYS.includes(task.key)) {
    d.updateAttempt(attempt, { progress });
    return;
  }
  const { lockoutAttempts, lockoutSeconds } = d.settings.tasks;
  const wrongCount = attempt.wrongCount + 1;
  if (wrongCount < lockoutAttempts) {
    d.updateAttempt(attempt, { progress, wrongCount });
    return;
  }
  const seconds = nextLockSeconds(task, lockoutSeconds);
  d.updateAttempt(attempt, {
    progress,
    wrongCount: 0,
    lockouts: attempt.lockouts + 1,
    lockedUntil: d.now + seconds * 1000,
  });
  d.emit({ type: 'lockedOut', teamId: team.id, key: task.key });
}

function solveTask(d: Draft, team: TeamState, task: TeamTaskState, attempt: AttemptState): void {
  d.updateAttempt(attempt, { result: 'SOLVED', endedAt: d.now });
  d.updateTeamTask(task, { status: 'DONE', completedAt: d.now });
  d.emit({ type: 'taskSolved', teamId: team.id, key: task.key });
  if (tasksDone(team) < TASKS_PER_TEAM || team.finishedAt !== null) return;
  // The time bonus is fixed now: play seconds left to the current end of play.
  const secondsLeft = playSecondsRemaining(d.state, d.now, d.settings.phases);
  d.updateTeam(team, { finishedAt: d.now, finishPlaySecondsRemaining: secondsLeft });
  d.emit({ type: 'teamFinished', teamId: team.id, playSecondsRemaining: secondsLeft });
  d.emit({ type: 'potionChanged', potion: potionOf(d.state) });
}

// Timer runs out, Give up, or Hangman's wrong-letter limit: the task fails and costs the penalty.
// Task Funds may go below zero here. The team may restart the task later.
export function failTask(
  d: Draft,
  team: TeamState,
  task: TeamTaskState,
  attempt: AttemptState,
  result: AttemptResult,
): void {
  d.updateAttempt(attempt, {
    result,
    endedAt: d.now,
    frozenRemainingMs: null,
    frozenLockMs: null,
  });
  d.updateTeamTask(task, { status: 'FAILED' });
  d.ledger(team, 'TASK', -d.settings.tasks.failPenalty, 'FAIL_PENALTY', {
    taskAttemptId: attempt.id,
  });
  d.emit({ type: 'taskEnded', teamId: team.id, key: task.key, result });
}

export function giveUp(d: Draft, teamId: string, taskId: string): EngineResult {
  const found = findRunning(d, teamId, taskId);
  if (!found.ok) return found;
  const { team, task, attempt } = found.value;
  failTask(d, team, task, attempt, 'GAVE_UP');
  return ok(undefined);
}

// Called by the scheduler when a task timer reaches zero.
export function timeoutTask(d: Draft, teamId: string, taskId: string): void {
  const team = d.team(teamId);
  const task = team?.tasks[taskId];
  const attempt = task && runningAttempt(task);
  if (!team || !task || !attempt) return;
  failTask(d, team, task, attempt, 'FAILED_TIMEOUT');
}
