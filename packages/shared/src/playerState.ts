import type {
  AttemptResult,
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
  // Saved at the end of Round 1. Null before then.
  halftime: { percent: number; completedTeams: number; totalTeams: number } | null;
}

export interface PlayerTaskView {
  id: string;
  key: TaskKey;
  name: string;
  type: TaskType;
  status: TeamTaskStatus;
  attempts: number;
  // The task timer length and the points for solving it, from the game settings.
  timerSeconds: number;
  points: number;
  running: {
    number: number;
    msLeft: number;
    lockMsLeft: number;
    hintsUsed: number;
    // Wrong tries since the last lockout (lockout tasks only).
    wrongCount: number;
    // How long the next lock would last, in seconds (it grows with each lock).
    nextLockSeconds: number;
    view: unknown;
  } | null;
  // How the latest finished try ended, or null if none has.
  lastResult: AttemptResult | null;
}

// A wallet change that is not a transfer: a hint, a fail penalty, or a facilitator change.
// Transfers are listed from the feed.
export interface TransactionLine {
  id: string;
  at: number;
  kind: 'HINT' | 'FAIL_PENALTY' | 'STAFF_ADJUST' | 'UNDO';
  taskName: string | null;
  taskFunds: number;
  supportFunds: number;
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
  // Arrived transfers only. Sent at the Reveal for the debrief; null before then.
  fundsGiven: number | null;
  fundsReceived: number | null;
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
  // The game's rule numbers, for the Rules tab and the task cards. Nothing secret.
  settings: GameSettings;
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
  // Newest first.
  transactions: TransactionLine[];
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

// Who holds which team's fragment. Testing only: sent to the main admin when dev tools are on,
// never to players.
export interface StaffFragmentView {
  kind: 'VAULT' | 'FIND_CODE';
  neededByTeamName: string;
  holderTeamName: string;
  value: string;
}

export interface StaffState {
  game: GameClockView;
  potion: PotionView;
  staff: { id: string; name: string; role: StaffRole };
  teams: StaffTeamView[];
  devTools: boolean;
  // Null unless dev tools are on and this is the main admin.
  devFragments: StaffFragmentView[] | null;
}
