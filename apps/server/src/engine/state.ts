import type {
  AttemptResult,
  FragmentKind,
  FundRequestStatus,
  GamePhase,
  GameSettings,
  InboxKind,
  PhotoStatus,
  PotionSnapshotKind,
  TaskKey,
  TaskType,
  TeamStatus,
  TeamTaskStatus,
} from '@magic-potion/shared';
import type { Json } from './checkers';
import type { Potion } from './potion';

// The in-memory state of one live game. It mirrors the database rows, with times as
// epoch milliseconds. Plain objects only, so a command can work on a structuredClone.

export interface AttemptState {
  id: string;
  number: number;
  contentId: string;
  startedAt: number;
  endsAt: number;
  // Set while timers are frozen: time left on the task timer and on a code lockout.
  frozenRemainingMs: number | null;
  frozenLockMs: number | null;
  hintsUsed: number;
  wrongCount: number;
  lockedUntil: number | null;
  progress: Json;
  result: AttemptResult | null;
  endedAt: number | null;
}

export interface TeamTaskState {
  id: string;
  key: TaskKey;
  type: TaskType;
  status: TeamTaskStatus;
  completedAt: number | null;
  attempts: AttemptState[];
}

export interface InboxResponseState {
  id: string;
  inboxItemId: string;
  attempts: number;
  lastAnswer: string | null;
  correct: boolean;
  photoUrl: string | null;
  photoStatus: PhotoStatus | null;
  reviewedByStaffId: string | null;
}

export interface TeamState {
  id: string;
  code: string;
  name: string;
  status: TeamStatus;
  removedAt: number | null;
  chainPosition: number | null;
  taskFunds: number;
  supportFunds: number;
  finishedAt: number | null;
  finishPlaySecondsRemaining: number | null;
  // Keyed by TeamTask id, in draw order (common tasks first).
  tasks: Record<string, TeamTaskState>;
  // Keyed by InboxItem id.
  inbox: Record<string, InboxResponseState>;
}

export interface FragmentState {
  id: string;
  kind: FragmentKind;
  holderTeamId: string;
  neededByTeamId: string;
  value: string;
  // For Find the Code: the needing team's word and cipher. Never sent to players.
  secretData: Json | null;
  releasedAt: number | null;
  releasedByStaffId: string | null;
}

export interface TransferState {
  id: string;
  fromTeamId: string;
  toTeamId: string;
  amount: number;
  sentAt: number;
  arrivesAt: number;
  frozenRemainingMs: number | null;
  arrivedAt: number | null;
  fundRequestId: string | null;
}

export interface FundRequestState {
  id: string;
  requesterTeamId: string;
  payerTeamId: string;
  amount: number;
  status: FundRequestStatus;
  createdAt: number;
  decidedAt: number | null;
}

export interface InboxItemState {
  id: string;
  kind: InboxKind;
  title: string;
  body: string;
  publicData: Json;
  // Accepted spellings for a question. Never sent to players.
  secretAnswer: string[] | null;
  releaseAtPlaySeconds: number | null;
  releasedAt: number | null;
  reward: number;
}

export interface ChatMessageState {
  id: string;
  teamId: string;
  // 1 or 2. The per-round limit counts a team's messages in the current round.
  round: number;
  body: string;
  createdAt: number;
}

export interface GameState {
  id: string;
  name: string;
  settings: GameSettings;
  scoringLockedAt: number | null;
  phase: GamePhase;
  phaseStartedAt: number | null;
  phaseEndsAt: number | null;
  frozenAt: number | null;
  extensionSeconds: number;
  playMsBeforePhase: number;
  startedAt: number | null;
  endedAt: number | null;
  teams: Record<string, TeamState>;
  fragments: Record<string, FragmentState>;
  transfers: Record<string, TransferState>;
  requests: Record<string, FundRequestState>;
  inboxItems: Record<string, InboxItemState>;
  // In the order they were sent.
  chat: ChatMessageState[];
  potionSnapshots: Partial<Record<PotionSnapshotKind, Potion>>;
}

// Task content never changes during a game, so it is kept outside the cloned state.
export interface ContentState {
  id: string;
  key: TaskKey;
  variant: number;
  publicData: unknown;
  secretData: unknown;
}

export interface GameContent {
  byId: Record<string, ContentState>;
  byKey: Partial<Record<TaskKey, ContentState[]>>;
  // TaskDefinition row ids, needed when creating TeamTask rows.
  taskDefinitionIds: Partial<Record<TaskKey, string>>;
}

export function runningAttempt(task: TeamTaskState): AttemptState | undefined {
  const last = task.attempts[task.attempts.length - 1];
  return last && last.result === null ? last : undefined;
}

export function openTask(team: TeamState): TeamTaskState | undefined {
  return Object.values(team.tasks).find((t) => runningAttempt(t));
}

export function tasksDone(team: TeamState): number {
  return Object.values(team.tasks).filter((t) => t.status === 'DONE').length;
}

export function activeTeams(state: GameState): TeamState[] {
  return Object.values(state.teams).filter((t) => t.status === 'ACTIVE');
}
