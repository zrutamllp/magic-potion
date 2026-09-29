import {
  DEFAULT_SETTINGS,
  TASK_DEFINITIONS,
  TaskKeySchema,
  parseTaskContent,
  type GameSettings,
} from '@magic-potion/shared';
import { SAMPLE_INBOX_ITEMS, SAMPLE_TASK_CONTENT } from '../../prisma/sampleContent';
import type { Clock } from './clock';
import { GameEngine } from './engine';
import { MemoryPersistence } from './persistence/memory';
import { seededRng } from './rng';
import type { ContentState, GameContent, GameState, InboxItemState, TeamState } from './state';

// Builds a lobby game in memory with the sample content pack, for tests and the simulation.

export function sampleContent(): GameContent {
  const content: GameContent = { byId: {}, byKey: {}, taskDefinitionIds: {} };
  for (const def of TASK_DEFINITIONS) content.taskDefinitionIds[def.key] = `def-${def.key}`;
  for (const c of SAMPLE_TASK_CONTENT) {
    const key = TaskKeySchema.parse(c.key);
    const parsed = parseTaskContent(key, c);
    const row: ContentState = {
      id: `content-${key}-${c.variant}`,
      key,
      variant: c.variant,
      ...parsed,
    };
    content.byId[row.id] = row;
    (content.byKey[key] ??= []).push(row);
  }
  return content;
}

export function lobbyTeam(i: number): TeamState {
  return {
    id: `team-${i}`,
    code: `TEAM${String(i).padStart(2, '0')}`,
    name: `Team ${i}`,
    status: 'ACTIVE',
    removedAt: null,
    chainPosition: null,
    taskFunds: 0,
    supportFunds: 0,
    finishedAt: null,
    finishPlaySecondsRemaining: null,
    lastActionAt: null,
    tasks: {},
    inbox: {},
  };
}

export function lobbyState(
  teamCount: number,
  settings: GameSettings = DEFAULT_SETTINGS,
): GameState {
  const teams: Record<string, TeamState> = {};
  for (let i = 1; i <= teamCount; i++) {
    const t = lobbyTeam(i);
    teams[t.id] = t;
  }
  const inboxItems: Record<string, InboxItemState> = {};
  SAMPLE_INBOX_ITEMS.forEach((item, i) => {
    const id = `inbox-${i + 1}`;
    inboxItems[id] = {
      id,
      kind: item.kind,
      title: item.title,
      body: item.body,
      publicData: {},
      secretAnswer: item.secretAnswer,
      releaseAtPlaySeconds: settings.inbox.releaseAtPlaySeconds[item.releaseSlot] ?? null,
      releasedAt: null,
      reward: settings.inbox.reward,
    };
  });
  return {
    id: 'game-1',
    name: 'Memory game',
    settings: structuredClone(settings),
    scoringLockedAt: null,
    phase: 'LOBBY',
    phaseStartedAt: null,
    phaseEndsAt: null,
    frozenAt: null,
    extensionSeconds: 0,
    playMsBeforePhase: 0,
    startedAt: null,
    endedAt: null,
    teams,
    fragments: {},
    transfers: {},
    requests: {},
    adjustments: {},
    inboxItems,
    chat: [],
    ledger: {},
    potionSnapshots: {},
  };
}

export function memoryEngine(opts: {
  teams: number;
  clock: Clock;
  seed?: number;
  settings?: GameSettings;
}): { engine: GameEngine; persistence: MemoryPersistence } {
  const persistence = new MemoryPersistence();
  const engine = new GameEngine({
    state: lobbyState(opts.teams, opts.settings),
    content: sampleContent(),
    persistence,
    clock: opts.clock,
    rng: seededRng(opts.seed ?? 1),
  });
  return { engine, persistence };
}
