import { render } from '@testing-library/react';
import { vi } from 'vitest';
import type { ReactElement } from 'react';
import {
  DEFAULT_SETTINGS,
  type Ack,
  type FeedItem,
  type PlayerState,
  type PlayerTaskView,
} from '@magic-potion/shared';
import { GameContext, type Game } from '../GameContext';
import type { Route } from '../router';

// A realistic player state for component tests. Override any part.

export function task(overrides: Partial<PlayerTaskView> = {}): PlayerTaskView {
  return {
    id: 'task-vault',
    key: 'vault',
    name: 'The Vault',
    type: 'COMMON',
    status: 'NOT_STARTED',
    attempts: 0,
    timerSeconds: 720,
    points: 10_000,
    running: null,
    lastResult: null,
    savedAnswer: null,
    ...overrides,
  };
}

export function playerState(overrides: Partial<PlayerState> = {}): PlayerState {
  const base: PlayerState = {
    game: {
      id: 'game-1',
      name: 'Demo Game',
      phase: 'ROUND1',
      frozen: false,
      timersRunning: true,
      phaseMsLeft: 20 * 60_000,
      playMsRemaining: 55 * 60_000,
      serverNow: 0,
    },
    branding: DEFAULT_SETTINGS.branding,
    settings: DEFAULT_SETTINGS,
    team: {
      id: 'team-1',
      name: 'Team 1',
      taskFunds: 10_000,
      supportFunds: 4_500,
      tasksDone: 1,
      tasks: [
        task(),
        task({ id: 'task-find', key: 'find_code', name: 'Find the Code', status: 'DONE' }),
        task({
          id: 'task-riddle',
          key: 'riddle',
          name: 'Riddle',
          type: 'UNIQUE',
          timerSeconds: 480,
        }),
        task({
          id: 'task-hangman',
          key: 'hangman',
          name: 'Hangman',
          type: 'UNIQUE',
          status: 'FAILED',
          attempts: 1,
        }),
        task({ id: 'task-data', key: 'data_story', name: 'Data Story', type: 'UNIQUE' }),
      ],
      foundItems: ['4-2-9'],
    },
    potion: { percent: 25, completedTeams: 1, totalTeams: 4, halftime: null },
    chat: { messagesLeft: 3, messagesPerRound: 5, maxLength: 300 },
    teams: [
      { id: 'team-2', name: 'Team 2' },
      { id: 'team-3', name: 'Team 3' },
    ],
    pendingTransfers: [],
    pendingRequests: [],
    transactions: [],
    inbox: [],
    leaderboard: {
      final: false,
      valid: false,
      rows: [
        {
          teamId: 'team-1',
          name: 'Team 1',
          rank: null,
          tasksDone: 1,
          taskFunds: 10_000,
          score: 30_000,
          potionShare: 0,
          fundsGiven: null,
          fundsReceived: null,
        },
      ],
    },
  };
  return { ...base, ...overrides };
}

export function renderGame(
  ui: ReactElement,
  opts: { state?: PlayerState; feed?: FeedItem[]; route?: Route; ack?: Ack } = {},
) {
  const send = vi.fn(async () => opts.ack ?? ({ ok: true } as Ack));
  const go = vi.fn();
  const state = opts.state ?? playerState();
  const game: Game = {
    state,
    feed: opts.feed ?? [],
    status: 'online',
    send: send as unknown as Game['send'],
    phaseMsLeft: () => state.game.phaseMsLeft,
    timerMsLeft: (ms) => ms,
    act: async (_done: string | null, run: () => Promise<Ack>) => (await run()).ok,
    notice: null,
    dismissNotice: () => undefined,
    route: opts.route ?? { tab: 'home' },
    go,
  };
  const result = render(<GameContext.Provider value={game}>{ui}</GameContext.Provider>);
  return { ...result, send, go };
}
