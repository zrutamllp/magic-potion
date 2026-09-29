import type { TaskKey, TaskSecretContent } from '@magic-potion/shared';
import { vaultFragmentDigits } from './assignment';
import type { CheckerContext } from './checkers';
import type {
  HangmanProgress,
  PictionaryProgress,
  EscapeProgress,
  PuzzleProgress,
  SpotProgress,
} from './checkers/playTasks';
import type { CelebrityProgress } from './checkers/guessCelebrity';
import { poolOrder } from './checkers/pool';
import type { QuestionsProgress } from './checkers/questions';
import { seededRng } from './rng';
import { checkerContext } from './rules/tasks';
import { runningAttempt, type GameContent, type GameState } from './state';

// Reads secret content to produce answers. For tests and the simulation only:
// the live server never uses this.

function secret<K extends TaskKey>(ctx: CheckerContext<TaskKey>): TaskSecretContent<K> {
  return ctx.secretData as TaskSecretContent<K>;
}

function contextFor(state: GameState, content: GameContent, teamId: string, taskId: string) {
  const team = state.teams[teamId];
  const task = team?.tasks[taskId];
  const attempt = task && runningAttempt(task);
  if (!team || !task || !attempt) return null;
  return { task, attempt, ctx: checkerContext(state, content, team, task, attempt, seededRng(0)) };
}

// The submissions that solve the running attempt from where it is now.
export function correctSubmissions(
  state: GameState,
  content: GameContent,
  teamId: string,
  taskId: string,
): unknown[] {
  const found = contextFor(state, content, teamId, taskId);
  if (!found) return [];
  const { task, attempt, ctx } = found;
  const progress = attempt.progress;
  switch (task.key) {
    case 'vault':
      return [
        {
          code: secret<'vault'>(ctx).clueDigits.join('') + vaultFragmentDigits(ctx.fragment ?? ''),
        },
      ];
    case 'find_code':
      return [{ answer: ctx.cipher?.word ?? '' }];
    case 'alien_translator':
      return [{ answer: secret<'alien_translator'>(ctx).answer[0] }];
    case 'picture_puzzle': {
      // Put each spot's tile in place with one swap, in order.
      const order = [...(progress as PuzzleProgress).order];
      const swaps: unknown[] = [];
      for (let i = 0; i < order.length; i++) {
        if (order[i] === i) continue;
        const j = order.indexOf(i);
        [order[i], order[j]] = [order[j] as number, order[i] as number];
        swaps.push({ swap: [i, j] });
      }
      return swaps;
    }
    case 'hangman': {
      const p = progress as HangmanProgress;
      const letters = new Set(hangmanPhrase(ctx, p).replace(/[^a-z]/g, ''));
      return [...letters].filter((l) => !p.guessed.includes(l)).map((letter) => ({ letter }));
    }
    case 'spot_difference': {
      const p = progress as SpotProgress;
      return secret<'spot_difference'>(ctx)
        .areas.filter((_, i) => !p.found.includes(i))
        .map((a) => ({ x: a.x, y: a.y }));
    }
    case 'guess_celebrity': {
      // Name the photo on screen, then each unnamed one after it, in play order.
      const p = progress as CelebrityProgress;
      const names = secret<'guess_celebrity'>(ctx).names;
      const n = p.order.length;
      return Array.from({ length: n }, (_, step) => (p.current + step) % n)
        .filter((i) => p.named[i] === null)
        .map((i) => ({ answer: names[p.order[i] ?? '']?.[0] ?? '' }));
    }
    case 'riddle':
    case 'data_story': {
      // Answers go by position in the drawn set, not in the pool.
      const p = progress as QuestionsProgress;
      const answers = (ctx.secretData as { answers: string[][] }).answers;
      return poolOrder(p, answers.length)
        .map((poolIndex, index) => ({ index, answer: answers[poolIndex]?.[0] }))
        .filter(({ index }) => p.answers[index] === null);
    }
    case 'pictionary': {
      const p = progress as PictionaryProgress;
      const words = secret<'pictionary'>(ctx).words;
      return poolOrder(p, words.length)
        .slice(p.current)
        .map((i) => ({ answer: words[i]?.[0] }));
    }
    case 'escape_room': {
      const p = progress as EscapeProgress;
      return secret<'escape_room'>(ctx)
        .stages.slice(p.stage)
        .map((s) => ({ answer: s.answer[0] }));
    }
    case 'ethical_dilemma':
      return [{ choice: 1, reason: 'We talked it through as a team.' }];
  }
}

// A submission that is well formed but wrong, or null if the task has no wrong answer.
export function wrongSubmission(
  state: GameState,
  content: GameContent,
  teamId: string,
  taskId: string,
): unknown {
  const found = contextFor(state, content, teamId, taskId);
  if (!found) return null;
  const { task, attempt, ctx } = found;
  switch (task.key) {
    case 'vault':
      return { code: '000000' };
    // A swap is never wrong.
    case 'picture_puzzle':
      return null;
    case 'hangman': {
      const p = attempt.progress as HangmanProgress;
      const phrase = hangmanPhrase(ctx, p);
      const letter = [...'zqxjkvbpygfwmucldrhsnioate'].find(
        (l) => !phrase.includes(l) && !p.guessed.includes(l),
      );
      return letter ? { letter } : null;
    }
    case 'spot_difference':
      return { x: -1000, y: -1000 };
    case 'riddle':
    case 'data_story': {
      const p = attempt.progress as QuestionsProgress;
      const index = p.answers.findIndex((a) => a === null);
      return index < 0 ? null : { index, answer: 'not this one' };
    }
    case 'ethical_dilemma':
      return null;
    default:
      return { answer: 'not this one' };
  }
}

// The phrase a Hangman try plays, lower case.
function hangmanPhrase(ctx: CheckerContext<TaskKey>, progress: HangmanProgress): string {
  const phrases = secret<'hangman'>(ctx).phrases;
  return (phrases[poolOrder(progress, 1)[0] ?? 0] ?? '').toLowerCase();
}
