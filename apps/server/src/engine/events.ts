import type { AttemptResult, GamePhase, TaskKey } from '@magic-potion/shared';
import type { SubmitResult } from './checkers';
import type { Potion } from './potion';

// What happened, sent to listeners after each change is saved.
// Phase 3 turns these into Socket.IO pushes; the simulation counts them.

export type EngineEvent =
  | { type: 'phaseChanged'; phase: GamePhase; at: number }
  | { type: 'frozen'; at: number }
  | { type: 'resumed'; at: number }
  | { type: 'extended'; seconds: number }
  | { type: 'gameEnded'; at: number }
  | { type: 'teamRemoved'; teamId: string }
  | { type: 'taskStarted'; teamId: string; key: TaskKey; attempt: number }
  | { type: 'taskChecked'; teamId: string; key: TaskKey; status: SubmitResult<unknown>['status'] }
  | { type: 'lockedOut'; teamId: string; key: TaskKey }
  | { type: 'hintUsed'; teamId: string; key: TaskKey; fromSupport: number; fromTask: number }
  | { type: 'taskSolved'; teamId: string; key: TaskKey }
  | { type: 'taskEnded'; teamId: string; key: TaskKey; result: AttemptResult }
  | { type: 'teamFinished'; teamId: string; playSecondsRemaining: number }
  | { type: 'potionChanged'; potion: Potion }
  | { type: 'transferSent'; transferId: string }
  | { type: 'transferArrived'; transferId: string }
  | { type: 'requestCreated'; requestId: string }
  | { type: 'requestDecided'; requestId: string }
  | { type: 'inboxReleased'; itemId: string }
  | { type: 'inboxAnswered'; teamId: string; itemId: string; correct: boolean }
  | { type: 'photoReviewed'; teamId: string; itemId: string }
  | { type: 'chatSent'; teamId: string; messageId: string }
  | { type: 'alertPosted'; itemId: string }
  // A facilitator changed something (Phase 6C): funds, a name, a lock, a fragment, a request.
  | { type: 'staffAction'; action: string; teamId: string | null }
  // A team acted or logged in. Only the staff dashboard needs to hear about it.
  | { type: 'teamSeen'; teamId: string };

export type EngineListener = (events: readonly EngineEvent[]) => void;
