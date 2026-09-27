import type { EngineResult } from '@magic-potion/shared';
import { fail, ok, type Draft } from '../draft';
import { timersRunning } from '../playClock';
import type { GameState } from '../state';

// Chat (GAME_RULES section 6): one channel for all teams, a message limit per team per round.
// Like everything else, chat freezes in the Pause and while the admin has paused the game.

// The round a message counts toward: 1 or 2, or null outside the rounds.
function currentRound(state: GameState): 1 | 2 | null {
  if (state.phase === 'ROUND1') return 1;
  if (state.phase === 'ROUND2') return 2;
  return null;
}

// What "Messages left: 3 of 5" shows. Before Round 2 the count shows the fresh limit;
// after play it shows 0.
export function messagesLeft(state: GameState, teamId: string): number {
  const limit = state.settings.chat.messagesPerRound;
  if (state.phase === 'LOBBY' || state.phase === 'PAUSE') return limit;
  const round = currentRound(state);
  if (round === null) return 0;
  const used = state.chat.filter((m) => m.teamId === teamId && m.round === round).length;
  return Math.max(0, limit - used);
}

export function sendChat(
  d: Draft,
  teamId: string,
  body: string,
): EngineResult<{ messageId: string; messagesLeft: number }> {
  const round = currentRound(d.state);
  if (round === null) return fail('WRONG_PHASE');
  if (!timersRunning(d.state)) return fail('GAME_FROZEN');
  const team = d.team(teamId);
  if (!team) return fail('TEAM_NOT_FOUND');
  if (team.status !== 'ACTIVE') return fail('TEAM_REMOVED');
  const text = typeof body === 'string' ? body.trim() : '';
  if (text === '') return fail('CHAT_EMPTY');
  if (text.length > d.settings.chat.maxLength) return fail('CHAT_TOO_LONG');
  if (messagesLeft(d.state, teamId) <= 0) return fail('CHAT_LIMIT_REACHED');
  const message = d.createChatMessage({ teamId, round, body: text, createdAt: d.now });
  d.emit({ type: 'chatSent', teamId, messageId: message.id });
  return ok({ messageId: message.id, messagesLeft: messagesLeft(d.state, teamId) });
}
