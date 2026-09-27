import type { TaskKey, TaskSecretContent } from '@magic-potion/shared';
import { vaultFragmentDigits } from './assignment';
import type { CheckerContext } from './checkers';
import type {
  HangmanProgress,
  PictionaryProgress,
  EscapeProgress,
  SpotProgress,
} from './checkers/playTasks';
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
      const pub = ctx.publicData as { rows: number; cols: number };
      return [{ order: Array.from({ length: pub.rows * pub.cols }, (_, i) => i) }];
    }
    case 'hangman': {
      const p = progress as HangmanProgress;
      const letters = new Set(
        secret<'hangman'>(ctx)
          .phrase.toLowerCase()
          .replace(/[^a-z]/g, ''),
      );
      return [...letters].filter((l) => !p.guessed.includes(l)).map((letter) => ({ letter }));
    }
    case 'spot_difference': {
      const p = progress as SpotProgress;
      return secret<'spot_difference'>(ctx)
        .areas.filter((_, i) => !p.found.includes(i))
        .map((a) => ({ x: a.x, y: a.y }));
    }
    case 'sound_sleuth':
    case 'riddle':
    case 'data_story': {
      const p = progress as QuestionsProgress;
      const answers = (ctx.secretData as { answers: string[][] }).answers;
      return answers
        .map((accepted, index) => ({ index, answer: accepted[0] }))
        .filter(({ index }) => p.answers[index] === null);
    }
    case 'pictionary': {
      const p = progress as PictionaryProgress;
      return secret<'pictionary'>(ctx)
        .words.slice(p.current)
        .map((w) => ({ answer: w[0] }));
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
    case 'picture_puzzle': {
      const pub = ctx.publicData as { rows: number; cols: number };
      const n = pub.rows * pub.cols;
      return { order: Array.from({ length: n }, (_, i) => (i + 1) % n) };
    }
    case 'hangman': {
      const p = attempt.progress as HangmanProgress;
      const phrase = secret<'hangman'>(ctx).phrase.toLowerCase();
      const letter = [...'zqxjkvbpygfwmucldrhsnioate'].find(
        (l) => !phrase.includes(l) && !p.guessed.includes(l),
      );
      return letter ? { letter } : null;
    }
    case 'spot_difference':
      return { x: -1000, y: -1000 };
    case 'sound_sleuth':
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
