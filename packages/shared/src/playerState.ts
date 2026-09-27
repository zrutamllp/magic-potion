import type {
  FundRequestStatus,
  GamePhase,
  InboxKind,
  PhotoStatus,
  StaffRole,
  TeamStatus,
  TeamTaskStatus,
} from './enums';
import type { GameSettings } from './settings';
import type { TaskKey, TaskType } from './taskKeys';

// What the server sends to browsers. Only public data: no answers, no other teams' fragments.
//
// Countdowns are sent as "ms left at serverNow". The browser counts down from the moment it
// received the state, so its own clock never matters, and a refresh simply asks again.

export interface GameClockView {
  id: string;
  name: string;
  phase: GamePhase;
  // True while the admin has paused the game. The phase countdown stops.
  frozen: boolean;
  // True only while Round 1 or 2 is running and not paused. Task timers and transfers count down.
  timersRunning: boolean;
  phaseMsLeft: number | null;
  playMsRemaining: number;
  serverNow: number;
}

export interface PotionView {
  percent: number;
  completedTeams: number;
  totalTeams: number;
  halftimePercent: number | null;
}

export interface PlayerTaskView {
  id: string;
  key: TaskKey;
  name: string;
  type: TaskType;
  status: TeamTaskStatus;
  attempts: number;
  running: {
    number: number;
    msLeft: number;
    lockMsLeft: number;
    hintsUsed: number;
    view: unknown;
  } | null;
}

export interface PlayerTransferView {
  id: string;
  direction: 'out' | 'in';
  otherTeamId: string;
  otherTeamName: string;
  amount: number;
  msLeft: number;
}

export interface PlayerRequestView {
  id: string;
  // "incoming": another team asks this team to pay. "outgoing": this team asked.
  direction: 'incoming' | 'outgoing';
  otherTeamId: string;
  otherTeamName: string;
  amount: number;
}

export interface PlayerInboxView {
  id: string;
  kind: InboxKind;
  title: string;
  body: string;
  publicData: unknown;
  done: boolean;
  attemptsLeft: number | null;
  photoStatus: PhotoStatus | null;
}

export interface LeaderboardRowView {
  teamId: string;
  name: string;
  // Null in Round 1: ranks are hidden everywhere.
  rank: number | null;
  tasksDone: number;
  taskFunds: number;
  score: number;
  potionShare: number;
}

export interface LeaderboardView {
  final: boolean;
  // At the Reveal: false means the potion is not full and nobody wins.
  valid: boolean;
  rows: LeaderboardRowView[];
}

export interface PlayerState {
  game: GameClockView;
  branding: GameSettings['branding'];
  team: {
    id: string;
    name: string;
    taskFunds: number;
    supportFunds: number;
    tasksDone: number;
    tasks: PlayerTaskView[];
    foundItems: string[];
  };
  potion: PotionView;
  chat: { messagesLeft: number; messagesPerRound: number; maxLength: number };
  // Other active teams, to send funds to.
  teams: { id: string; name: string }[];
  pendingTransfers: PlayerTransferView[];
  pendingRequests: PlayerRequestView[];
  inbox: PlayerInboxView[];
  // Null in the Lobby and the Pause.
  leaderboard: LeaderboardView | null;
}

// One line in the chat feed. Chat goes to every team; transfer and request lines go only to
// the two teams involved (and staff). A line with the same kind and id replaces the old one.
export type FeedItem =
  | { kind: 'chat'; id: string; at: number; teamId: string; teamName: string; body: string }
  | {
      kind: 'transfer';
      id: string;
      at: number;
      fromTeamId: string;
      fromTeamName: string;
      toTeamId: string;
      toTeamName: string;
      amount: number;
      arrived: boolean;
    }
  | {
      kind: 'request';
      id: string;
      at: number;
      requesterTeamId: string;
      requesterTeamName: string;
      payerTeamId: string;
      payerTeamName: string;
      amount: number;
      status: FundRequestStatus;
    };

export interface StaffTeamView {
  id: string;
  code: string;
  name: string;
  status: TeamStatus;
  online: boolean;
  taskFunds: number;
  supportFunds: number;
  tasksDone: number;
  messagesLeft: number;
}

export interface StaffState {
  game: GameClockView;
  potion: PotionView;
  staff: { id: string; name: string; role: StaffRole };
  teams: StaffTeamView[];
  devTools: boolean;
}
