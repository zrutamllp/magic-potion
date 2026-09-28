import type { TaskKey } from '@magic-potion/shared';
import { z } from 'zod';
import { matchesAny, matchesAnyLoose } from '../normalize';
import { asJson, defineChecker, type CheckerContext, type TaskChecker } from './types';

// Shared checker for tasks with a fixed list of questions, answered one at a time:
// Riddle, Sound Sleuth and Data Story. The task is solved when every answer is correct.

export type QuestionsProgress = {
  // The accepted answer the team typed, or null while unanswered.
  answers: (string | null)[];
  hint: { index: number; text: string } | null;
};

const submission = z.object({
  index: z.number().int().nonnegative(),
  answer: z.string().max(200),
});

export function questionsChecker<K extends TaskKey>(opts: {
  accepted: (ctx: CheckerContext<K>) => string[][];
  hintText: (ctx: CheckerContext<K>, index: number) => string;
  // Riddle: also ignore punctuation, all spaces and the words a/an/the.
  loose?: boolean;
}): TaskChecker<K, QuestionsProgress> {
  const matches = opts.loose ? matchesAnyLoose : matchesAny;
  return defineChecker<K, QuestionsProgress>({
    submission,
    init: (ctx) => ({ answers: opts.accepted(ctx).map(() => null), hint: null }),
    submit(ctx, progress, raw) {
      const parsed = submission.safeParse(raw);
      if (!parsed.success) return { status: 'invalid' };
      const { index, answer } = parsed.data;
      const accepted = opts.accepted(ctx)[index];
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
      return { ...progress, hint: { index, text: opts.hintText(ctx, index) } };
    },
    publicView: (ctx, progress) => ({
      content: asJson(ctx.publicData),
      answers: progress.answers,
      hint: progress.hint,
    }),
  });
}
