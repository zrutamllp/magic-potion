import type { EngineResult } from '@magic-potion/shared';
import { fail, ok, type Draft } from '../draft';
import { matchesAny } from '../normalize';
import { timersRunning } from '../playClock';

// Inbox bonus tasks (GAME_RULES section 7). They stay open until play ends.
// Like everything else, the inbox freezes in the Pause.

function openItem(d: Draft, teamId: string, itemId: string) {
  if (d.state.phase !== 'ROUND1' && d.state.phase !== 'ROUND2') return fail('WRONG_PHASE');
  if (!timersRunning(d.state)) return fail('GAME_FROZEN');
  const team = d.team(teamId);
  if (!team) return fail('TEAM_NOT_FOUND');
  if (team.status !== 'ACTIVE') return fail('TEAM_REMOVED');
  const item = d.state.inboxItems[itemId];
  if (!item || item.kind === 'ALERT') return fail('INBOX_NOT_FOUND');
  if (item.releasedAt === null) return fail('INBOX_NOT_RELEASED');
  return ok({ team, item });
}

// A question has 3 attempts; the server checks the answer.
export function answerInbox(
  d: Draft,
  teamId: string,
  itemId: string,
  answer: string,
): EngineResult<{ correct: boolean; attemptsLeft: number }> {
  const found = openItem(d, teamId, itemId);
  if (!found.ok) return found;
  const { team, item } = found.value;
  if (item.kind !== 'QUESTION') return fail('INBOX_NOT_FOUND');
  if (typeof answer !== 'string' || answer.trim() === '' || answer.length > 200) {
    return fail('INVALID_ANSWER');
  }
  const response = team.inbox[itemId];
  if (response?.correct) return fail('INBOX_ALREADY_DONE');
  const attempts = (response?.attempts ?? 0) + 1;
  const max = d.settings.inbox.answerAttempts;
  if (attempts > max) return fail('NO_ATTEMPTS_LEFT');
  const correct = matchesAny(answer, item.secretAnswer ?? []);
  d.saveInboxResponse(team, itemId, { attempts, lastAnswer: answer.trim(), correct });
  d.emit({ type: 'inboxAnswered', teamId, itemId, correct });
  return ok({ correct, attemptsLeft: max - attempts });
}

// The team photo is accepted automatically. A rejected photo can be uploaded again.
export function submitPhoto(
  d: Draft,
  teamId: string,
  itemId: string,
  photoUrl: string,
): EngineResult {
  const found = openItem(d, teamId, itemId);
  if (!found.ok) return found;
  const { team, item } = found.value;
  if (item.kind !== 'PHOTO') return fail('INBOX_NOT_FOUND');
  if (typeof photoUrl !== 'string' || photoUrl.trim() === '') return fail('INVALID_ANSWER');
  if (team.inbox[itemId]?.photoStatus === 'ACCEPTED') return fail('INBOX_ALREADY_DONE');
  d.saveInboxResponse(team, itemId, {
    photoUrl,
    photoStatus: 'ACCEPTED',
    reviewedByStaffId: null,
  });
  d.emit({ type: 'inboxAnswered', teamId, itemId, correct: true });
  return ok(undefined);
}

// Staff can reject a photo. Its 1,000 is removed until a photo is accepted.
export function rejectPhoto(
  d: Draft,
  staffUserId: string,
  teamId: string,
  itemId: string,
  reason: string,
): EngineResult {
  if (d.state.phase === 'LOBBY') return fail('WRONG_PHASE');
  const team = d.team(teamId);
  if (!team) return fail('TEAM_NOT_FOUND');
  const response = team.inbox[itemId];
  if (!response || response.photoStatus !== 'ACCEPTED') return fail('INBOX_NOT_FOUND');
  d.saveInboxResponse(team, itemId, { photoStatus: 'REJECTED', reviewedByStaffId: staffUserId });
  d.audit({
    staffUserId,
    action: 'REJECT_PHOTO',
    teamId,
    before: { photoStatus: 'ACCEPTED' },
    after: { photoStatus: 'REJECTED' },
    reason,
  });
  d.emit({ type: 'photoReviewed', teamId, itemId });
  return ok(undefined);
}
