import type { EngineResult } from '@magic-potion/shared';
import { fail, ok, type Draft } from '../draft';
import { timersRunning } from '../playClock';
import type { TeamState } from '../state';

// Transfers and fund requests (GAME_RULES section 5).
// Sending and requests are open only while play runs: they freeze in the Pause.

function checkPlay(d: Draft): EngineResult<null> {
  if (d.state.phase !== 'ROUND1' && d.state.phase !== 'ROUND2') return fail('WRONG_PHASE');
  if (!timersRunning(d.state)) return fail('GAME_FROZEN');
  return ok(null);
}

function checkPair(
  d: Draft,
  fromId: string,
  toId: string,
  amount: number,
): EngineResult<{ from: TeamState; to: TeamState }> {
  const play = checkPlay(d);
  if (!play.ok) return play;
  if (!Number.isInteger(amount) || amount <= 0) return fail('INVALID_AMOUNT');
  if (fromId === toId) return fail('CANNOT_SEND_TO_SELF');
  const from = d.team(fromId);
  const to = d.team(toId);
  if (!from || !to) return fail('TEAM_NOT_FOUND');
  if (from.status !== 'ACTIVE' || to.status !== 'ACTIVE') return fail('TEAM_REMOVED');
  return ok({ from, to });
}

// The amount leaves the sender at once and arrives after the transfer delay.
function createTransfer(
  d: Draft,
  from: TeamState,
  to: TeamState,
  amount: number,
  fundRequestId: string | null,
) {
  const transfer = d.createTransfer({
    fromTeamId: from.id,
    toTeamId: to.id,
    amount,
    sentAt: d.now,
    arrivesAt: d.now + d.settings.transfers.delaySeconds * 1000,
    frozenRemainingMs: null,
    arrivedAt: null,
    fundRequestId,
  });
  d.ledger(from, 'TASK', -amount, 'TRANSFER_OUT', { transferId: transfer.id });
  d.emit({ type: 'transferSent', transferId: transfer.id });
  return transfer;
}

export function sendFunds(
  d: Draft,
  fromId: string,
  toId: string,
  amount: number,
): EngineResult<{ transferId: string; arrivesAt: number }> {
  const pair = checkPair(d, fromId, toId, amount);
  if (!pair.ok) return pair;
  const { from, to } = pair.value;
  if (from.taskFunds < amount) return fail('NOT_ENOUGH_FUNDS');
  const t = createTransfer(d, from, to, amount, null);
  return ok({ transferId: t.id, arrivesAt: t.arrivesAt });
}

// Called by the scheduler. Arrivals still happen after play ends, and they count.
export function arriveTransfer(d: Draft, transferId: string): void {
  const t = d.state.transfers[transferId];
  const to = t && d.team(t.toTeamId);
  if (!t || !to || t.arrivedAt !== null) return;
  d.updateTransfer(t, { arrivedAt: d.now });
  d.ledger(to, 'TASK', t.amount, 'TRANSFER_IN', { transferId: t.id });
  d.emit({ type: 'transferArrived', transferId: t.id });
}

// A request carries only an amount, no free text.
export function requestFunds(
  d: Draft,
  requesterId: string,
  payerId: string,
  amount: number,
): EngineResult<{ requestId: string }> {
  const pair = checkPair(d, requesterId, payerId, amount);
  if (!pair.ok) return pair;
  const r = d.createRequest({
    requesterTeamId: requesterId,
    payerTeamId: payerId,
    amount,
    status: 'PENDING',
    createdAt: d.now,
    decidedAt: null,
  });
  d.emit({ type: 'requestCreated', requestId: r.id });
  return ok({ requestId: r.id });
}

function pendingRequest(d: Draft, requestId: string) {
  const play = checkPlay(d);
  if (!play.ok) return play;
  const r = d.state.requests[requestId];
  if (!r) return fail('REQUEST_NOT_FOUND');
  if (r.status !== 'PENDING') return fail('REQUEST_CLOSED');
  return ok(r);
}

// Accepting creates a normal transfer. Blocked if the payer's Task Funds are too low.
export function acceptRequest(
  d: Draft,
  payerId: string,
  requestId: string,
): EngineResult<{ transferId: string }> {
  const found = pendingRequest(d, requestId);
  if (!found.ok) return found;
  const r = found.value;
  if (r.payerTeamId !== payerId) return fail('REQUEST_NOT_FOUND');
  const payer = d.team(r.payerTeamId);
  const requester = d.team(r.requesterTeamId);
  if (!payer || !requester) return fail('TEAM_NOT_FOUND');
  if (payer.status !== 'ACTIVE' || requester.status !== 'ACTIVE') return fail('TEAM_REMOVED');
  if (payer.taskFunds < r.amount) return fail('PAYER_NOT_ENOUGH_FUNDS');
  d.updateRequest(r, { status: 'ACCEPTED', decidedAt: d.now });
  d.emit({ type: 'requestDecided', requestId: r.id });
  const t = createTransfer(d, payer, requester, r.amount, r.id);
  return ok({ transferId: t.id });
}

export function declineRequest(d: Draft, payerId: string, requestId: string): EngineResult {
  const found = pendingRequest(d, requestId);
  if (!found.ok) return found;
  if (found.value.payerTeamId !== payerId) return fail('REQUEST_NOT_FOUND');
  d.updateRequest(found.value, { status: 'DECLINED', decidedAt: d.now });
  d.emit({ type: 'requestDecided', requestId });
  return ok(undefined);
}

export function cancelRequest(d: Draft, requesterId: string, requestId: string): EngineResult {
  const found = pendingRequest(d, requestId);
  if (!found.ok) return found;
  if (found.value.requesterTeamId !== requesterId) return fail('REQUEST_NOT_FOUND');
  d.updateRequest(found.value, { status: 'CANCELLED', decidedAt: d.now });
  d.emit({ type: 'requestDecided', requestId });
  return ok(undefined);
}
