import type { TaskKey } from '@magic-potion/shared';
import { alienTranslatorChecker, findCodeChecker, vaultChecker } from './codeTasks';
import {
  escapeRoomChecker,
  ethicalDilemmaChecker,
  hangmanChecker,
  picturePuzzleChecker,
  pictionaryChecker,
  spotDifferenceChecker,
} from './playTasks';
import { questionsChecker } from './questions';
import type { CheckerContext, Json, SubmitResult, TaskChecker } from './types';

export type { CheckerContext, Json, SubmitResult } from './types';

const CHECKERS: { [K in TaskKey]: TaskChecker<K, never> } = {
  vault: vaultChecker,
  find_code: findCodeChecker,
  picture_puzzle: picturePuzzleChecker,
  hangman: hangmanChecker,
  spot_difference: spotDifferenceChecker,
  alien_translator: alienTranslatorChecker,
  sound_sleuth: questionsChecker<'sound_sleuth'>({
    accepted: (ctx) => ctx.secretData.answers,
    hintText: (ctx, i) => ctx.secretData.clueTranscripts[i] ?? '',
  }),
  pictionary: pictionaryChecker,
  escape_room: escapeRoomChecker,
  riddle: questionsChecker<'riddle'>({
    accepted: (ctx) => ctx.secretData.answers,
    hintText: (ctx, i) => ctx.secretData.clues[i] ?? '',
    loose: true,
  }),
  ethical_dilemma: ethicalDilemmaChecker,
  data_story: questionsChecker<'data_story'>({
    accepted: (ctx) => ctx.secretData.answers,
    hintText: (ctx, i) => ctx.secretData.hintChartIds[i] ?? '',
    loose: true,
  }),
} as unknown as { [K in TaskKey]: TaskChecker<K, never> };

// The engine stores progress as plain JSON. These helpers hide the per-task types.
// Content must already be parsed with parseTaskContent.

type AnyContext = CheckerContext<TaskKey>;

function checkerFor(key: TaskKey): TaskChecker<TaskKey, Json> {
  return CHECKERS[key] as unknown as TaskChecker<TaskKey, Json>;
}

export function initProgress(key: TaskKey, ctx: AnyContext): Json {
  return checkerFor(key).init(ctx);
}

export function checkSubmission(
  key: TaskKey,
  ctx: AnyContext,
  progress: Json,
  submission: unknown,
): SubmitResult<Json> {
  return checkerFor(key).submit(ctx, progress, submission);
}

export function applyHint(key: TaskKey, ctx: AnyContext, progress: Json): Json {
  return checkerFor(key).hint(ctx, progress);
}

export function publicView(key: TaskKey, ctx: AnyContext, progress: Json): Json {
  return checkerFor(key).publicView(ctx, progress);
}
