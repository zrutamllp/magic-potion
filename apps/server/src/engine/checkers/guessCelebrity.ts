import { z } from 'zod';
import { matchesName } from '../normalize';
import { shuffle } from '../rng';
import { defineChecker } from './types';

// Guess the Celebrity: name the person in each photo, one photo at a time. Each try draws its
// photos from the content (how many is a setting). Pass moves on to the next unnamed photo and
// passed photos come back later. A wrong name costs nothing. Only the photo being guessed is
// ever sent to players, never the list of photos and never a name.
export type CelebrityProgress = {
  // Face ids for this try, in play order.
  order: string[];
  // What the team typed for each face in order, or null while unnamed.
  named: (string | null)[];
  // Index into order of the photo on screen.
  current: number;
  hint: { current: number; text: string } | null;
};

const submission = z.union([
  z.object({ answer: z.string().max(200) }),
  z.object({ pass: z.literal(true) }),
]);

// The next unnamed photo after index `from`, wrapping round, or -1 when all are named.
function nextUnnamed(named: readonly (string | null)[], from: number): number {
  for (let step = 1; step <= named.length; step++) {
    const i = (from + step) % named.length;
    if (named[i] === null) return i;
  }
  return -1;
}

// "Shah Rukh Khan" becomes "S___ R___ K___": the first letter of each word, a line per other
// letter. Initials stay as they are ("M.S. Dhoni" becomes "M.S. D____").
export function nameHint(name: string): string {
  const letter = /\p{L}|\p{N}/u;
  const chars = [...name.trim().replace(/\s+/g, ' ')];
  return chars
    .map((ch, i) => {
      if (!letter.test(ch)) return ch;
      const startsWord = i === 0 || !letter.test(chars[i - 1] ?? ' ');
      return startsWord ? ch.toUpperCase() : '_';
    })
    .join('');
}

export const guessCelebrityChecker = defineChecker<'guess_celebrity', CelebrityProgress>({
  submission,
  init(ctx) {
    const ids = ctx.publicData.faces.map((f) => f.id);
    const count = Math.min(ctx.tasks.guessCelebrityFaces, ids.length);
    const order = shuffle(ctx.rng, ids).slice(0, count);
    return { order, named: order.map(() => null), current: 0, hint: null };
  },
  submit(ctx, progress, raw) {
    const parsed = submission.safeParse(raw);
    if (!parsed.success) return { status: 'invalid' };
    const faceId = progress.order[progress.current];
    if (faceId === undefined || progress.named[progress.current] !== null) {
      return { status: 'invalid' };
    }
    if ('pass' in parsed.data) {
      const next = nextUnnamed(progress.named, progress.current);
      // Nothing to pass to when this is the last unnamed photo.
      if (next < 0 || next === progress.current) return { status: 'invalid' };
      return { status: 'correct', progress: { ...progress, current: next } };
    }
    const answer = parsed.data.answer.trim();
    if (answer === '') return { status: 'invalid' };
    if (!matchesName(answer, ctx.secretData.names[faceId] ?? [])) {
      return { status: 'wrong', progress };
    }
    const named = progress.named.map((n, i) => (i === progress.current ? answer : n));
    const next = nextUnnamed(named, progress.current);
    if (next < 0) return { status: 'solved', progress: { ...progress, named } };
    return { status: 'correct', progress: { ...progress, named, current: next } };
  },
  // The first letter of each word of the name on screen. It stays with that photo.
  hint(ctx, progress) {
    const faceId = progress.order[progress.current];
    const name = faceId === undefined ? undefined : ctx.secretData.names[faceId]?.[0];
    if (!name) return progress;
    return { ...progress, hint: { current: progress.current, text: nameHint(name) } };
  },
  publicView(ctx, progress) {
    const faceId = progress.order[progress.current];
    const face = ctx.publicData.faces.find((f) => f.id === faceId);
    const unnamed = progress.named.filter((n) => n === null).length;
    const done = unnamed === 0;
    return {
      taskName: ctx.publicData.taskName,
      imageUrl: done ? null : (face?.imageUrl ?? null),
      // "Face 3 of 8": the photo's place in this try.
      position: progress.current + 1,
      total: progress.order.length,
      // Names the team got right, in the order they were played.
      named: progress.named.filter((n): n is string => n !== null),
      canPass: unnamed > 1,
      hint: !done && progress.hint?.current === progress.current ? progress.hint.text : null,
    };
  },
});
