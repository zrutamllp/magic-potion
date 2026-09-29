import { z } from 'zod';
import type { GamePhase, StaffRole } from './enums';
import type { StaffWatchSchema } from './live';
import type { FeedItem, PlayerState, StaffState } from './playerState';

// The Socket.IO contract between server and browser, and the REST login bodies.
// Every payload a browser sends is checked against these schemas on the server.

const Id = z.string().min(1).max(64);
// Rules like "above zero" and "enough funds" are checked by the engine.
const Amount = z.number();

export const TeamLoginSchema = z.object({
  code: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(128),
});
export type TeamLogin = z.infer<typeof TeamLoginSchema>;

export const StaffLoginSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
});
export type StaffLogin = z.infer<typeof StaffLoginSchema>;

export interface TeamLoginResponse {
  token: string;
  teamId: string;
  teamName: string;
  gameId: string;
}

export interface StaffLoginResponse {
  token: string;
  staff: { id: string; name: string; role: StaffRole };
}

export interface StaffGameSummary {
  id: string;
  name: string;
  phase: GamePhase;
  // Hidden from the list unless "Show archived" is on (Phase 6B).
  archived?: boolean;
  // Round 1 has started (a played game can never be deleted).
  started?: boolean;
  // The game has reached the Reveal or ended (it can be archived).
  finished?: boolean;
}

// The engine enforces the per-game message length; this only stops huge payloads.
export const ChatSendSchema = z.object({ body: z.string().max(2000) });
export const FundsSendSchema = z.object({ toTeamId: Id, amount: Amount });
export const FundsRequestSchema = z.object({ payerTeamId: Id, amount: Amount });
export const RequestIdSchema = z.object({ requestId: Id });
export const InboxAnswerSchema = z.object({ itemId: Id, answer: z.string().max(200) });
export const TaskIdSchema = z.object({ taskId: Id });
export const TaskSubmitSchema = z.object({ taskId: Id, submission: z.unknown() });

export type Ack<T = unknown> =
  { ok: true; value?: T } | { ok: false; code?: string; message: string };
export type AckFn = (ack: Ack) => void;

// Browser to server. Every action answers through the ack callback.
export interface ClientToServerEvents {
  'chat:send': (p: z.infer<typeof ChatSendSchema>, ack: AckFn) => void;
  'funds:send': (p: z.infer<typeof FundsSendSchema>, ack: AckFn) => void;
  'funds:request': (p: z.infer<typeof FundsRequestSchema>, ack: AckFn) => void;
  'funds:accept': (p: z.infer<typeof RequestIdSchema>, ack: AckFn) => void;
  'funds:decline': (p: z.infer<typeof RequestIdSchema>, ack: AckFn) => void;
  'funds:cancel': (p: z.infer<typeof RequestIdSchema>, ack: AckFn) => void;
  'inbox:answer': (p: z.infer<typeof InboxAnswerSchema>, ack: AckFn) => void;
  'task:start': (p: z.infer<typeof TaskIdSchema>, ack: AckFn) => void;
  'task:hint': (p: z.infer<typeof TaskIdSchema>, ack: AckFn) => void;
  'task:submit': (p: z.infer<typeof TaskSubmitSchema>, ack: AckFn) => void;
  'task:giveUp': (p: z.infer<typeof TaskIdSchema>, ack: AckFn) => void;
  // Staff only: follow one team's own view ("View as team"), or stop with null.
  'staff:watch': (p: z.infer<typeof StaffWatchSchema>, ack: AckFn) => void;
}

// Server to browser. The full state comes on every (re)connect, so a browser never needs
// to remember anything between connections.
export interface ServerToClientEvents {
  'state:full': (p: { state: PlayerState; feed: FeedItem[] }) => void;
  'state:update': (p: { state: PlayerState }) => void;
  'staff:full': (p: { state: StaffState; feed: FeedItem[] }) => void;
  'staff:update': (p: { state: StaffState }) => void;
  // Staff only: exactly what the watched team sees, sent on every change.
  'staff:team': (p: { teamId: string; state: PlayerState; feed: FeedItem[] }) => void;
  // Staff only: the audit log changed; fetch it again.
  'staff:audit': () => void;
  'feed:item': (item: FeedItem) => void;
  'session:ended': (p: { code: string; message: string }) => void;
}
