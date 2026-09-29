import { z } from 'zod';
import type { FragmentKind, TeamTaskStatus } from './enums';
import type { TaskType } from './taskKeys';

// Live control and the facilitator dashboard (Phase 6C). The server checks every body with
// these schemas; who may do what is checked on the server too (GAME_RULES section 11).

const reason = z.string().trim().min(1, 'Type a reason.').max(300);

export const ExtendSchema = z.object({
  seconds: z
    .number()
    .int()
    .positive()
    .max(24 * 3600),
});

export const AdjustFundsSchema = z.object({
  // A change to Task Funds: above zero adds, below zero takes away.
  amount: z
    .number()
    .int('Enter a whole amount.')
    .refine((n) => n !== 0, 'Enter an amount that is not zero.')
    .refine((n) => Math.abs(n) <= 1_000_000, 'That amount is too large.'),
  reason,
});
export type AdjustFunds = z.infer<typeof AdjustFundsSchema>;

export const DecideAdjustmentSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(300).optional(),
});

export const LiveRenameSchema = z.object({ name: z.string().trim().min(1).max(40) });

export const BroadcastMessageSchema = z.object({
  title: z.string().trim().min(1, 'Type a title.').max(80),
  body: z.string().trim().min(1, 'Type a message.').max(500),
});
export type BroadcastMessage = z.infer<typeof BroadcastMessageSchema>;

export const RemoveTeamSchema = z.object({ reason });

export const TaskActionSchema = z.object({ taskId: z.string().min(1).max(64) });

// Stopping a try: the note for the audit log is optional.
export const StopTaskSchema = TaskActionSchema.extend({
  reason: z.string().trim().max(300).optional(),
});

export const ReleaseFragmentSchema = z.object({ fragmentId: z.string().min(1).max(64) });

export const StaffWatchSchema = z.object({ teamId: z.string().min(1).max(64).nullable() });

// ---------- Views ----------

export interface StaffTaskView {
  id: string;
  name: string;
  type: TaskType;
  status: TeamTaskStatus;
  // Only while a try is running.
  running: { number: number; msLeft: number; lockMsLeft: number } | null;
}

// A fragment this team needs. Staff see who holds it, never its value.
export interface StaffNeededFragmentView {
  id: string;
  kind: FragmentKind;
  holderTeamName: string;
  holderOnline: boolean;
  released: boolean;
}

export type StuckReason = 'NEGATIVE_FUNDS' | 'IDLE';

export interface StaffAdjustmentRequestView {
  id: string;
  teamId: string;
  teamName: string;
  amount: number;
  reason: string;
  requestedByName: string;
  requestedById: string;
  createdAt: number;
}

// Changes that can be undone (the answer from Phase 6C planning).
export const UNDOABLE_ACTIONS = ['ADJUST_FUNDS', 'RENAME_TEAM'] as const;

export interface AuditRowView {
  id: string;
  at: number;
  staffName: string;
  teamName: string | null;
  action: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  undoneAt: number | null;
  undoOfId: string | null;
  canUndo: boolean;
}

export interface ResetLoginReply {
  teamId: string;
  teamName: string;
  code: string;
  // Shown once, then never again.
  password: string;
}

export interface AdjustReply {
  // "applied": the funds changed now. "requested": waiting for the main admin.
  outcome: 'applied' | 'requested';
}
