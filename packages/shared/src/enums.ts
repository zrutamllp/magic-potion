// String values shared by server and web. The Prisma schema uses the same names.

export const GAME_PHASES = ['LOBBY', 'ROUND1', 'PAUSE', 'ROUND2', 'REVEAL'] as const;
export type GamePhase = (typeof GAME_PHASES)[number];

export const TEAM_STATUSES = ['ACTIVE', 'REMOVED'] as const;
export type TeamStatus = (typeof TEAM_STATUSES)[number];

export const TEAM_TASK_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'FAILED'] as const;
export type TeamTaskStatus = (typeof TEAM_TASK_STATUSES)[number];

export const ATTEMPT_RESULTS = [
  'SOLVED',
  'FAILED_TIMEOUT',
  'GAVE_UP',
  'FAILED_WRONG',
  'STOPPED_AT_END',
  'STOPPED_BY_STAFF',
] as const;
export type AttemptResult = (typeof ATTEMPT_RESULTS)[number];

export const FRAGMENT_KINDS = ['VAULT', 'FIND_CODE'] as const;
export type FragmentKind = (typeof FRAGMENT_KINDS)[number];

export const WALLETS = ['TASK', 'SUPPORT'] as const;
export type Wallet = (typeof WALLETS)[number];

export const LEDGER_KINDS = [
  'START',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'FAIL_PENALTY',
  'HINT',
  'STAFF_ADJUST',
  'UNDO',
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export const FUND_REQUEST_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED'] as const;
export type FundRequestStatus = (typeof FUND_REQUEST_STATUSES)[number];

export const INBOX_KINDS = ['PHOTO', 'QUESTION', 'ALERT'] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

export const PHOTO_STATUSES = ['ACCEPTED', 'REJECTED'] as const;
export type PhotoStatus = (typeof PHOTO_STATUSES)[number];

export const POTION_SNAPSHOT_KINDS = ['HALFTIME', 'FINAL'] as const;
export type PotionSnapshotKind = (typeof POTION_SNAPSHOT_KINDS)[number];

export const STAFF_ROLES = ['MAIN_ADMIN', 'CO_FACILITATOR'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ADJUSTMENT_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type AdjustmentRequestStatus = (typeof ADJUSTMENT_REQUEST_STATUSES)[number];
