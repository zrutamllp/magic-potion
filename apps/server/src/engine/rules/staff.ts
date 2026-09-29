import { UNDOABLE_ACTIONS, type EngineResult } from '@magic-potion/shared';
import type { Json } from '../checkers';
import { fail, ok, type Draft } from '../draft';
import { runningAttempt, type TeamState } from '../state';
import { releaseToNeedingTeam } from './fragments';
import { stopAttempt } from './phases';

// Facilitator actions during a live game (GAME_RULES section 11, Phase 6C). Who may do what is
// checked before these run; here are the game rules. Every action is audited, and players
// only ever see "Funds adjusted by the facilitator", never who made a change.

const NAME_MAX = 40;

// Funds and team changes are for a running game: not the Lobby, and not once scores are final.
function liveCheck(d: Draft): EngineResult<null> {
  if (d.state.phase === 'LOBBY' || d.state.phase === 'REVEAL') return fail('WRONG_PHASE');
  return ok(null);
}

function notEnded(d: Draft): EngineResult<null> {
  return d.state.endedAt === null ? ok(null) : fail('GAME_ENDED');
}

function activeTeam(d: Draft, teamId: string): EngineResult<TeamState> {
  const team = d.team(teamId);
  if (!team) return fail('TEAM_NOT_FOUND');
  if (team.status === 'REMOVED') return fail('TEAM_REMOVED');
  return ok(team);
}

function staffAction(d: Draft, action: string, teamId: string | null): void {
  d.emit({ type: 'staffAction', action, teamId });
}

function validAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount !== 0;
}

// Staff changes may take Task Funds below zero (GAME_RULES section 5). They are not funds
// given or received, so they only move the score through Task Funds.
export function adjustFunds(
  d: Draft,
  staffUserId: string,
  teamId: string,
  amount: number,
  reason: string,
  extra: { requestId?: string; requestedById?: string } = {},
): EngineResult<{ auditId: string }> {
  const live = liveCheck(d);
  if (!live.ok) return live;
  if (!validAmount(amount)) return fail('INVALID_ADJUSTMENT');
  if (reason.trim() === '') return fail('REASON_REQUIRED');
  const found = activeTeam(d, teamId);
  if (!found.ok) return found;
  const team = found.value;
  const before = team.taskFunds;
  const auditId = d.audit({
    staffUserId,
    action: 'ADJUST_FUNDS',
    teamId,
    before: { taskFunds: before },
    after: { taskFunds: before + amount, amount, ...extra },
    reason: reason.trim(),
  });
  // The ledger row points at its audit row, which must be written first.
  d.ledger(team, 'TASK', amount, 'STAFF_ADJUST', { auditLogId: auditId });
  staffAction(d, 'ADJUST_FUNDS', teamId);
  return ok({ auditId });
}

// A co-facilitator's change above their limit waits for the main admin. Funds do not change.
export function requestAdjustment(
  d: Draft,
  staff: { id: string; name: string },
  teamId: string,
  amount: number,
  reason: string,
): EngineResult<{ requestId: string }> {
  const live = liveCheck(d);
  if (!live.ok) return live;
  if (!validAmount(amount)) return fail('INVALID_ADJUSTMENT');
  if (reason.trim() === '') return fail('REASON_REQUIRED');
  const found = activeTeam(d, teamId);
  if (!found.ok) return found;
  const request = d.createAdjustmentRequest({
    teamId,
    requestedById: staff.id,
    requestedByName: staff.name,
    amount,
    reason: reason.trim(),
  });
  d.audit({
    staffUserId: staff.id,
    action: 'REQUEST_ADJUSTMENT',
    teamId,
    after: { amount, requestId: request.id },
    reason: reason.trim(),
  });
  staffAction(d, 'REQUEST_ADJUSTMENT', teamId);
  return ok({ requestId: request.id });
}

export function decideAdjustment(
  d: Draft,
  adminId: string,
  requestId: string,
  approve: boolean,
  note?: string,
): EngineResult {
  const request = d.state.adjustments[requestId];
  if (!request) return fail('ADJUSTMENT_NOT_FOUND');
  if (request.status !== 'PENDING') return fail('ADJUSTMENT_CLOSED');
  if (approve) {
    const applied = adjustFunds(d, adminId, request.teamId, request.amount, request.reason, {
      requestId,
      requestedById: request.requestedById,
    });
    if (!applied.ok) return applied;
  } else {
    d.audit({
      staffUserId: adminId,
      action: 'REJECT_ADJUSTMENT',
      teamId: request.teamId,
      before: { amount: request.amount, requestId },
      reason: note?.trim() || undefined,
    });
  }
  d.updateAdjustmentRequest(request, {
    status: approve ? 'APPROVED' : 'REJECTED',
    decidedById: adminId,
    decidedAt: d.now,
  });
  staffAction(d, approve ? 'APPROVE_ADJUSTMENT' : 'REJECT_ADJUSTMENT', request.teamId);
  return ok(undefined);
}

function nameTaken(d: Draft, teamId: string, name: string): boolean {
  const wanted = name.toLowerCase();
  return Object.values(d.state.teams).some(
    (t) => t.id !== teamId && t.name.trim().toLowerCase() === wanted,
  );
}

// The Lobby renames through the admin panel (Phase 6A); this is the live rename.
export function renameTeam(
  d: Draft,
  staffUserId: string,
  teamId: string,
  rawName: string,
): EngineResult {
  const ended = notEnded(d);
  if (!ended.ok) return ended;
  if (d.state.phase === 'LOBBY') return fail('WRONG_PHASE');
  const team = d.team(teamId);
  if (!team) return fail('TEAM_NOT_FOUND');
  const name = rawName.trim();
  if (name === '' || name.length > NAME_MAX) return fail('INVALID_NAME');
  if (name === team.name) return ok(undefined);
  if (nameTaken(d, teamId, name)) return fail('NAME_TAKEN');
  const before = team.name;
  d.updateTeam(team, { name });
  d.audit({
    staffUserId,
    action: 'RENAME_TEAM',
    teamId,
    before: { name: before },
    after: { name },
  });
  staffAction(d, 'RENAME_TEAM', teamId);
  return ok(undefined);
}

function runningTask(d: Draft, teamId: string, taskId: string) {
  const found = activeTeam(d, teamId);
  if (!found.ok) return found;
  const task = found.value.tasks[taskId];
  if (!task) return fail('TASK_NOT_FOUND');
  const attempt = runningAttempt(task);
  if (!attempt) return fail('TASK_NOT_RUNNING');
  return ok({ team: found.value, task, attempt });
}

// Ends a code lockout now (admin only). Earlier locks still count toward the next lock length.
export function clearLockout(
  d: Draft,
  staffUserId: string,
  teamId: string,
  taskId: string,
): EngineResult {
  const found = runningTask(d, teamId, taskId);
  if (!found.ok) return found;
  const { task, attempt } = found.value;
  const locked =
    (attempt.frozenLockMs ?? 0) > 0 ||
    (attempt.lockedUntil !== null && attempt.lockedUntil > d.now);
  if (!locked) return fail('NOT_LOCKED');
  const before = { lockedUntil: attempt.lockedUntil, frozenLockMs: attempt.frozenLockMs };
  d.updateAttempt(attempt, { lockedUntil: null, frozenLockMs: null, wrongCount: 0 });
  d.audit({
    staffUserId,
    action: 'CLEAR_LOCKOUT',
    teamId,
    before: { task: task.key, ...before },
    after: { task: task.key, lockedUntil: null },
  });
  staffAction(d, 'CLEAR_LOCKOUT', teamId);
  return ok(undefined);
}

// Stops a running try with no penalty (admin only). It does not count as done, the team's
// other tasks unlock, and the team may start it again.
export function stopTask(
  d: Draft,
  staffUserId: string,
  teamId: string,
  taskId: string,
  reason: string,
): EngineResult {
  const found = runningTask(d, teamId, taskId);
  if (!found.ok) return found;
  const { task, attempt } = found.value;
  stopAttempt(d, task, attempt, 'STOPPED_BY_STAFF');
  d.audit({
    staffUserId,
    action: 'STOP_TASK',
    teamId,
    before: { task: task.key, attempt: attempt.number, status: 'IN_PROGRESS' },
    after: { task: task.key, attempt: attempt.number, status: task.status },
    reason: reason.trim() || undefined,
  });
  d.emit({ type: 'taskEnded', teamId, key: task.key, result: 'STOPPED_BY_STAFF' });
  staffAction(d, 'STOP_TASK', teamId);
  return ok(undefined);
}

// When the holder team is missing, staff give the fragment straight to the team that needs it
// (GAME_RULES section 4). It then shows on that team's Home as a Found item.
export function releaseFragment(
  d: Draft,
  staffUserId: string,
  fragmentId: string,
): EngineResult<{ teamId: string }> {
  const ended = notEnded(d);
  if (!ended.ok) return ended;
  const fragment = d.state.fragments[fragmentId];
  if (!fragment) return fail('FRAGMENT_NOT_FOUND');
  if (fragment.releasedAt !== null) return fail('FRAGMENT_ALREADY_RELEASED');
  const found = activeTeam(d, fragment.neededByTeamId);
  if (!found.ok) return found;
  releaseToNeedingTeam(d, staffUserId, fragment);
  staffAction(d, 'RELEASE_FRAGMENT', fragment.neededByTeamId);
  return ok({ teamId: fragment.neededByTeamId });
}

// A message from the facilitator to every team's inbox.
export function postMessage(
  d: Draft,
  staffUserId: string,
  title: string,
  body: string,
): EngineResult<{ itemId: string }> {
  const ended = notEnded(d);
  if (!ended.ok) return ended;
  if (title.trim() === '' || body.trim() === '') return fail('MESSAGE_EMPTY');
  const item = d.createAlert('FACILITATOR', { title: title.trim(), body: body.trim() });
  d.audit({
    staffUserId,
    action: 'SEND_MESSAGE',
    after: { title: item.title, body: item.body },
  });
  d.emit({ type: 'alertPosted', itemId: item.id });
  staffAction(d, 'SEND_MESSAGE', null);
  return ok({ itemId: item.id });
}

// An audit row to undo, as read from the database (the engine does not keep the audit log).
export interface UndoTarget {
  id: string;
  action: string;
  teamId: string | null;
  before: Json;
  after: Json;
  undoneAt: number | null;
  undoOfId: string | null;
}

function field(value: Json, key: string): Json | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value[key]
    : undefined;
}

// Undo covers fund changes and renames (Phase 6C). It writes a new audit row that points at
// the one it undoes, so the history stays complete.
export function undoChange(
  d: Draft,
  staffUserId: string,
  target: UndoTarget,
  reason: string,
): EngineResult {
  if (!(UNDOABLE_ACTIONS as readonly string[]).includes(target.action)) {
    return fail('NOTHING_TO_UNDO');
  }
  if (target.undoOfId !== null) return fail('NOTHING_TO_UNDO');
  if (target.undoneAt !== null) return fail('ALREADY_UNDONE');
  if (target.teamId === null) return fail('NOTHING_TO_UNDO');
  const team = d.team(target.teamId);
  if (!team) return fail('TEAM_NOT_FOUND');

  if (target.action === 'ADJUST_FUNDS') {
    const live = liveCheck(d);
    if (!live.ok) return live;
    const amount = field(target.after, 'amount');
    if (typeof amount !== 'number' || !validAmount(amount)) return fail('NOTHING_TO_UNDO');
    const before = team.taskFunds;
    const auditId = d.audit({
      staffUserId,
      action: 'UNDO',
      teamId: team.id,
      before: { taskFunds: before },
      after: { taskFunds: before - amount, amount: -amount, undid: 'ADJUST_FUNDS' },
      reason: reason.trim() || undefined,
      undoOfId: target.id,
    });
    d.ledger(team, 'TASK', -amount, 'UNDO', { auditLogId: auditId });
  } else {
    const ended = notEnded(d);
    if (!ended.ok) return ended;
    const oldName = field(target.before, 'name');
    const newName = field(target.after, 'name');
    if (typeof oldName !== 'string' || typeof newName !== 'string') return fail('NOTHING_TO_UNDO');
    if (team.name !== newName) return fail('UNDO_OUT_OF_DATE');
    if (nameTaken(d, team.id, oldName)) return fail('NAME_TAKEN');
    d.updateTeam(team, { name: oldName });
    d.audit({
      staffUserId,
      action: 'UNDO',
      teamId: team.id,
      before: { name: newName },
      after: { name: oldName, undid: 'RENAME_TEAM' },
      reason: reason.trim() || undefined,
      undoOfId: target.id,
    });
  }
  d.markAuditUndone(target.id);
  staffAction(d, 'UNDO', team.id);
  return ok(undefined);
}
