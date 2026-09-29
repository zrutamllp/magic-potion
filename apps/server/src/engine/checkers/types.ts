import type {
  FindCodeCipher,
  GameSettings,
  TaskKey,
  TaskPublicContent,
  TaskSecretContent,
} from '@magic-potion/shared';
import type { z } from 'zod';
import type { Rng } from '../rng';

// Every answer is checked on the server (GAME_RULES "Server-side checking").
// A checker owns one task's progress: it checks submissions, makes the hint,
// and builds the public view, which is the only thing players ever see.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface CheckerContext<K extends TaskKey> {
  publicData: TaskPublicContent<K>;
  secretData: TaskSecretContent<K>;
  // The fragment value this team needs (Vault and Find the Code), or null.
  fragment: string | null;
  // This team's own Find the Code cipher, made at game start, or null for other tasks.
  cipher: FindCodeCipher | null;
  tasks: GameSettings['tasks'];
  rng: Rng;
  // Progress of this team's earlier tries on the same content, so a pool task can draw entries
  // the team has not seen yet. Empty on the first try.
  previous?: Json[];
}

export type SubmitResult<P> =
  // The submission is malformed. Nothing changes and it is not a wrong try.
  | { status: 'invalid' }
  // A wrong answer. Counts toward the code lockout on tasks that have one.
  | { status: 'wrong'; progress: P }
  // A correct step (one riddle, one stage, one letter) but the task is not solved yet.
  | { status: 'correct'; progress: P }
  | { status: 'solved'; progress: P }
  // The task fails by its own rule (Hangman: too many wrong letters).
  | { status: 'failed'; progress: P };

export interface TaskChecker<K extends TaskKey, P extends Json> {
  submission: z.ZodType;
  init(ctx: CheckerContext<K>): P;
  submit(ctx: CheckerContext<K>, progress: P, submission: unknown): SubmitResult<P>;
  // Stores the hint in the progress, so it shows in the public view from then on.
  hint(ctx: CheckerContext<K>, progress: P): P;
  publicView(ctx: CheckerContext<K>, progress: P): Json;
}

export function defineChecker<K extends TaskKey, P extends Json>(
  checker: TaskChecker<K, P>,
): TaskChecker<K, P> {
  return checker;
}

// Content fields are plain JSON, so they can go straight into a public view.
export function asJson(value: unknown): Json {
  return value as Json;
}
