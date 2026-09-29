import type { TaskKey } from '@magic-potion/shared';
import { z } from 'zod';
import { matchesAny, matchesAnyLoose } from '../normalize';
import { drawPool, poolOrder } from './pool';
import { defineChecker, type CheckerContext, type Json, type TaskChecker } from './types';

// Shared checker for tasks with a list of questions, answered one at a time: Riddle and
// Data Story. Each try draws a set from the content's pool (Phase 6B); the team sees only that
// set and answers it by position. The task is solved when every drawn answer is correct.

export type QuestionsProgress = {
  // Positions in the pool that this try plays. Missing in progress saved before pools.
  order?: number[];
  // The accepted answer the team typed, or null while unanswered, by position in the set.
  answers: (string | null)[];
  hint: { index: number; text: string } | null;
};

const submission = z.object({
  index: z.number().int().nonnegative(),
  answer: z.string().max(200),
});

export function questionsChecker<K extends TaskKey>(opts: {
  // The whole pool's accepted answers, and the hint for one pool entry.
  accepted: (ctx: CheckerContext<K>) => string[][];
  hintText: (ctx: CheckerContext<K>, poolIndex: number) => string;
  // How many to draw per try (a setting).
  perTry: (ctx: CheckerContext<K>) => number;
  // The public content with only the drawn questions, in drawn order.
  viewContent: (ctx: CheckerContext<K>, order: number[]) => Json;
  // Riddle: also ignore punctuation, all spaces and the words a/an/the.
  loose?: boolean;
}): TaskChecker<K, QuestionsProgress> {
  const matches = opts.loose ? matchesAnyLoose : matchesAny;
  return defineChecker<K, QuestionsProgress>({
    submission,
    init: (ctx) => {
      const size = opts.accepted(ctx).length;
      const order = drawPool(ctx.rng, size, opts.perTry(ctx), ctx.previous ?? []);
      return { order, answers: order.map(() => null), hint: null };
    },
    submit(ctx, progress, raw) {
      const parsed = submission.safeParse(raw);
      if (!parsed.success) return { status: 'invalid' };
      const { index, answer } = parsed.data;
      const pool = opts.accepted(ctx);
      const accepted = pool[poolOrder(progress, pool.length)[index] ?? -1];
      if (!accepted || progress.answers[index] !== null) return { status: 'invalid' };
      if (!matches(answer, accepted)) return { status: 'wrong', progress };
      const answers = progress.answers.map((a, i) => (i === index ? answer.trim() : a));
      const next = { ...progress, answers };
      return answers.every((a) => a !== null)
        ? { status: 'solved', progress: next }
        : { status: 'correct', progress: next };
    },
    hint(ctx, progress) {
      const index = progress.answers.findIndex((a) => a === null);
      if (index < 0) return progress;
      const poolIndex = poolOrder(progress, opts.accepted(ctx).length)[index] ?? index;
      return { ...progress, hint: { index, text: opts.hintText(ctx, poolIndex) } };
    },
    // Only the drawn questions are sent, never the rest of the pool.
    publicView: (ctx, progress) => ({
      content: opts.viewContent(ctx, poolOrder(progress, opts.accepted(ctx).length)),
      answers: progress.answers,
      hint: progress.hint,
    }),
  });
}
