import { createContext, useContext } from 'react';
import type { Ack, FeedItem, PlayerState } from '@magic-potion/shared';
import type { Live, LiveStatus } from '../lib/live';
import type { Route } from './router';

// What every player screen needs: the latest state from the server, the clock for
// countdowns, and a way to send actions and show the answer.

export interface Notice {
  ok: boolean;
  text: string;
  id: number;
  // The screen it belongs to (a route hash). It is not shown on other screens.
  where: string;
}

export interface Game {
  state: PlayerState;
  feed: FeedItem[];
  status: LiveStatus;
  send: Live<PlayerState>['send'];
  // Sends the team photo (a REST upload: too big for the socket). Answers like an action.
  uploadPhoto: (itemId: string, file: Blob) => Promise<Ack>;
  // Countdowns: ms left now, counted from when the state arrived. "phase" stops only when the
  // admin pauses; "timer" (tasks, transfers) stops whenever play is not running.
  phaseMsLeft: () => number | null;
  timerMsLeft: (sentMsLeft: number) => number;
  // Runs an action, then shows the server's answer (or `done` when it worked). With `done`
  // null, success shows nothing: the screen itself changes (task screens).
  act: (done: string | null, run: () => Promise<Ack>) => Promise<boolean>;
  notice: Notice | null;
  dismissNotice: () => void;
  route: Route;
  go: (route: Route) => void;
}

export const GameContext = createContext<Game | null>(null);

export function useGame(): Game {
  const game = useContext(GameContext);
  if (!game) throw new Error('useGame must be used inside the game screens');
  return game;
}

// The provisional score and rank of this team, from the leaderboard the server allows.
export function ownRow(state: PlayerState) {
  return state.leaderboard?.rows.find((r) => r.teamId === state.team.id) ?? null;
}
