import { z } from 'zod';
import { matchesAny } from '../normalize';
import { shuffle } from '../rng';
import { asJson, defineChecker } from './types';

// Picture Puzzle: tiles are numbered 0..n-1 in solved order, on a grid set in the game
// settings. The server scrambles them; the team swaps two tiles at a time and every swap is
// saved, so a refresh never loses progress. A swap is never wrong (no penalty).
export type PuzzleProgress = { order: number[]; hint: boolean };

const swapSubmission = z.object({
  swap: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
});

function isSolved(order: readonly number[]): boolean {
  return order.every((tile, i) => tile === i);
}

export const picturePuzzleChecker = defineChecker<'picture_puzzle', PuzzleProgress>({
  submission: swapSubmission,
  init(ctx) {
    const { rows, cols } = ctx.tasks.picturePuzzleGrid;
    const solved = Array.from({ length: rows * cols }, (_, i) => i);
    let order = shuffle(ctx.rng, solved);
    while (isSolved(order)) order = shuffle(ctx.rng, solved);
    return { order, hint: false };
  },
  submit(_ctx, progress, raw) {
    const parsed = swapSubmission.safeParse(raw);
    if (!parsed.success) return { status: 'invalid' };
    const [a, b] = parsed.data.swap;
    const n = progress.order.length;
    if (a === b || a >= n || b >= n) return { status: 'invalid' };
    const order = [...progress.order];
    [order[a], order[b]] = [order[b] as number, order[a] as number];
    const next = { ...progress, order };
    return isSolved(order)
      ? { status: 'solved', progress: next }
      : { status: 'correct', progress: next };
  },
  // The hint marks every tile that is already in its right spot. The marks are worked out from
  // the current order each time, so they follow every swap until the try ends.
  hint: (_ctx, progress) => ({ ...progress, hint: true }),
  // The grid comes from the order the try started with, so a settings change never breaks it.
  publicView: (ctx, progress) => {
    const { rows, cols } = ctx.tasks.picturePuzzleGrid;
    const fits = rows * cols === progress.order.length;
    const side = Math.round(Math.sqrt(progress.order.length));
    return {
      content: asJson(ctx.publicData),
      rows: fits ? rows : side,
      cols: fits ? cols : side,
      order: progress.order,
      // Spots holding their right tile, after the hint only. Never says where other tiles go.
      inPlace: progress.hint
        ? progress.order.flatMap((tile, spot) => (tile === spot ? [spot] : []))
        : null,
    };
  },
});

// Hangman: guess one letter at a time. Too many wrong letters fails the task.
export type HangmanProgress = { guessed: string[]; wrong: number; hinted: string | null };

const letterSubmission = z.object({ letter: z.string().regex(/^[a-zA-Z]$/) });

function phraseLetters(phrase: string): Set<string> {
  return new Set(phrase.toLowerCase().replace(/[^a-z]/g, ''));
}

function maskPhrase(phrase: string, guessed: readonly string[]): string {
  return [...phrase]
    .map((ch) => (/[a-z]/i.test(ch) && !guessed.includes(ch.toLowerCase()) ? '_' : ch))
    .join('');
}

export const hangmanChecker = defineChecker<'hangman', HangmanProgress>({
  submission: letterSubmission,
  init: () => ({ guessed: [], wrong: 0, hinted: null }),
  submit(ctx, progress, raw) {
    const parsed = letterSubmission.safeParse(raw);
    if (!parsed.success) return { status: 'invalid' };
    const letter = parsed.data.letter.toLowerCase();
    if (progress.guessed.includes(letter)) return { status: 'invalid' };
    const letters = phraseLetters(ctx.secretData.phrase);
    const guessed = [...progress.guessed, letter];
    if (!letters.has(letter)) {
      const next = { ...progress, guessed, wrong: progress.wrong + 1 };
      return next.wrong >= ctx.tasks.hangmanMaxWrong
        ? { status: 'failed', progress: next }
        : { status: 'wrong', progress: next };
    }
    const next = { ...progress, guessed };
    return [...letters].every((l) => guessed.includes(l))
      ? { status: 'solved', progress: next }
      : { status: 'correct', progress: next };
  },
  // Reveals one letter, which does not count as a guess.
  hint(ctx, progress) {
    const missing = [...phraseLetters(ctx.secretData.phrase)].find(
      (l) => !progress.guessed.includes(l),
    );
    if (!missing) return progress;
    return { ...progress, guessed: [...progress.guessed, missing], hinted: missing };
  },
  publicView: (ctx, progress) => ({
    content: asJson(ctx.publicData),
    masked: maskPhrase(ctx.secretData.phrase, progress.guessed),
    guessed: progress.guessed,
    wrong: progress.wrong,
    maxWrong: ctx.tasks.hangmanMaxWrong,
    // The letter the hint revealed (already shown in the phrase), or null.
    hinted: progress.hinted,
  }),
});

// Spot the Difference: the client sends one click at a time, in image pixels; the server
// checks it against secret circles. A miss is never a penalty.
export type SpotProgress = { found: number[]; hint: { x: number; y: number; r: number } | null };

const clickSubmission = z.object({ x: z.number().finite(), y: z.number().finite() });

export const spotDifferenceChecker = defineChecker<'spot_difference', SpotProgress>({
  submission: clickSubmission,
  init: () => ({ found: [], hint: null }),
  submit(ctx, progress, raw) {
    const parsed = clickSubmission.safeParse(raw);
    if (!parsed.success) return { status: 'invalid' };
    const { x, y } = parsed.data;
    const areas = ctx.secretData.areas;
    // Forgiving for trackpads: every circle grows by a % of the image width (a setting),
    // and when a click is near two differences, the nearest one not yet found counts.
    const extra = (ctx.tasks.spotDifferenceTolerancePercent / 100) * ctx.publicData.width;
    let hit = -1;
    let best = Infinity;
    areas.forEach((a, i) => {
      if (progress.found.includes(i)) return;
      const d = Math.hypot(x - a.x, y - a.y);
      if (d <= a.r + extra && d - a.r < best) {
        best = d - a.r;
        hit = i;
      }
    });
    if (hit < 0) return { status: 'wrong', progress };
    const next = { ...progress, found: [...progress.found, hit] };
    return next.found.length === areas.length
      ? { status: 'solved', progress: next }
      : { status: 'correct', progress: next };
  },
  // Highlights a wide area around one difference that has not been found.
  hint(ctx, progress) {
    const area = ctx.secretData.areas.find((_, i) => !progress.found.includes(i));
    if (!area) return progress;
    return { ...progress, hint: { x: area.x, y: area.y, r: area.r * 3 } };
  },
  publicView: (ctx, progress) => ({
    content: asJson(ctx.publicData),
    found: progress.found.map((i) => {
      const a = ctx.secretData.areas[i];
      return a ? { x: a.x, y: a.y, r: a.r } : null;
    }),
    total: ctx.secretData.areas.length,
    hint: progress.hint,
  }),
});

// Pictionary: the game draws one picture at a time; the team guesses each word in turn.
export type PictionaryProgress = {
  current: number;
  guesses: string[];
  hint: { index: number; letter: string } | null;
};

const answerSubmission = z.object({ answer: z.string().max(200) });

export const pictionaryChecker = defineChecker<'pictionary', PictionaryProgress>({
  submission: answerSubmission,
  init: () => ({ current: 0, guesses: [], hint: null }),
  submit(ctx, progress, raw) {
    const parsed = answerSubmission.safeParse(raw);
    if (!parsed.success || parsed.data.answer.trim() === '') return { status: 'invalid' };
    const words = ctx.secretData.words;
    const accepted = words[progress.current];
    if (!accepted) return { status: 'invalid' };
    if (!matchesAny(parsed.data.answer, accepted)) return { status: 'wrong', progress };
    const next = {
      ...progress,
      current: progress.current + 1,
      guesses: [...progress.guesses, parsed.data.answer.trim()],
    };
    return next.current === words.length
      ? { status: 'solved', progress: next }
      : { status: 'correct', progress: next };
  },
  hint(ctx, progress) {
    const word = ctx.secretData.words[progress.current]?.[0];
    if (!word) return progress;
    return { ...progress, hint: { index: progress.current, letter: word.charAt(0).toUpperCase() } };
  },
  // Only drawings up to the current word are sent.
  publicView: (ctx, progress) => ({
    drawings: asJson(ctx.publicData.drawings.slice(0, progress.current + 1)),
    total: ctx.publicData.drawings.length,
    current: progress.current,
    guesses: progress.guesses,
    hint: progress.hint,
  }),
});

// Escape Room: 4 linked stages. Each stage is checked before the next one is sent.
export type EscapeProgress = { stage: number; hint: { stage: number; text: string } | null };

export const escapeRoomChecker = defineChecker<'escape_room', EscapeProgress>({
  submission: answerSubmission,
  init: () => ({ stage: 0, hint: null }),
  submit(ctx, progress, raw) {
    const parsed = answerSubmission.safeParse(raw);
    if (!parsed.success || parsed.data.answer.trim() === '') return { status: 'invalid' };
    const stages = ctx.secretData.stages;
    const current = stages[progress.stage];
    if (!current) return { status: 'invalid' };
    if (!matchesAny(parsed.data.answer, current.answer)) return { status: 'wrong', progress };
    const next = { ...progress, stage: progress.stage + 1 };
    return next.stage === stages.length
      ? { status: 'solved', progress: next }
      : { status: 'correct', progress: next };
  },
  hint(ctx, progress) {
    const current = ctx.secretData.stages[progress.stage];
    if (!current) return progress;
    return { ...progress, hint: { stage: progress.stage, text: current.hint } };
  },
  publicView: (ctx, progress) => ({
    intro: ctx.publicData.intro,
    stages: asJson(ctx.publicData.stages.slice(0, progress.stage + 1)),
    total: ctx.publicData.stages.length,
    stage: progress.stage,
    hint: progress.hint,
  }),
});

// Ethical Dilemma: any complete answer passes. The choice and reason are saved for the debrief.
export type DilemmaProgress = { choice: number | null; reason: string | null };

const dilemmaSubmission = z.object({
  choice: z.number().int().nonnegative(),
  reason: z.string().max(300),
});

export const ethicalDilemmaChecker = defineChecker<'ethical_dilemma', DilemmaProgress>({
  submission: dilemmaSubmission,
  init: () => ({ choice: null, reason: null }),
  submit(ctx, _progress, raw) {
    const parsed = dilemmaSubmission.safeParse(raw);
    if (!parsed.success) return { status: 'invalid' };
    const reason = parsed.data.reason.trim();
    if (parsed.data.choice >= ctx.publicData.options.length || reason === '') {
      return { status: 'invalid' };
    }
    return { status: 'solved', progress: { choice: parsed.data.choice, reason } };
  },
  hint: (_ctx, progress) => progress,
  publicView: (ctx, progress) => ({
    content: asJson(ctx.publicData),
    choice: progress.choice,
    reason: progress.reason,
  }),
});
