import { z } from 'zod';
import type { TaskKey } from './taskKeys';

// Task content is split in two. `public` may be sent to players.
// `secret` holds answers and hint material and never leaves the server.
// Media fields hold URLs (Vercel Blob in production, /sample/... for the sample pack).

const text = z.string().min(1);
const url = z.string().min(1);
// A text answer with its accepted spellings. Compared after trimming, lowercasing and collapsing spaces.
const acceptedAnswer = z.array(text).min(1);
const digit = z.string().regex(/^[0-9]$/);
const keyPair = z.object({ symbol: text, letter: text });
const point = z.tuple([z.number(), z.number()]);

// The different letters of a word, uppercased, in order of first use.
export function distinctLetters(word: string): string[] {
  return [...new Set(word.toUpperCase())];
}

export const TaskContentSchemas = {
  vault: {
    public: z.object({
      intro: text,
      clues: z.array(z.object({ text, imageUrl: url.optional() })).length(3),
    }),
    // The 3 on-screen digits, in code order. The other 3 digits are the fragment.
    secret: z.object({ clueDigits: z.array(digit).length(3) }),
  },
  find_code: {
    public: z.object({ intro: text }),
    // At game start the engine gives each team its own random letter code (never a real word,
    // so it cannot be guessed) and a random cipher from the symbol pool. Part of the key is on
    // screen; the rest is the fragment another team holds. Content saved with the old word list
    // still loads: unknown fields are ignored.
    secret: z
      .object({
        symbols: z.array(text).min(1),
        codeLength: z
          .object({ min: z.number().int().min(4).max(12), max: z.number().int().min(4).max(12) })
          .refine((l) => l.min <= l.max, 'min must not be above max')
          .default({ min: 6, max: 7 }),
      })
      .refine((s) => new Set(s.symbols).size === s.symbols.length, 'Symbols must be different')
      .refine(
        (s) => s.symbols.length >= s.codeLength.max,
        'Need at least one symbol per letter of the longest code',
      ),
  },
  picture_puzzle: {
    // The grid size is a game setting (tasks.picturePuzzleGrid). Width and height give the
    // picture's shape. Content saved with rows and cols still loads: they are ignored.
    public: z.object({
      title: text,
      imageUrl: url,
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    // The solved order is tile 0..n-1; the server scrambles it and checks every swap.
    secret: z.object({}),
  },
  hangman: {
    public: z.object({ category: text }),
    secret: z.object({ phrase: text }),
  },
  spot_difference: {
    public: z.object({
      leftImageUrl: url,
      rightImageUrl: url,
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
    // Hit areas are circles in image pixel coordinates.
    secret: z.object({
      areas: z
        .array(z.object({ x: z.number(), y: z.number(), r: z.number().positive() }))
        .length(7),
    }),
  },
  alien_translator: {
    public: z.object({ message: z.array(text).min(1), legend: z.array(keyPair).min(1) }),
    secret: z.object({ answer: acceptedAnswer, hiddenLegend: z.array(keyPair).min(3) }),
  },
  guess_celebrity: {
    // The task name players see comes from the content, so admins can rename it
    // ("Guess the Leader"). Photo file names must never contain the person's name.
    // The server sends only the photo being guessed, never the whole list.
    public: z.object({
      taskName: text,
      faces: z
        .array(z.object({ id: text, imageUrl: url }))
        .min(1)
        .refine((f) => new Set(f.map((x) => x.id)).size === f.length, 'Face ids must be different'),
    }),
    // Accepted names per face id. The first one is used for the hint.
    secret: z.object({ names: z.record(z.string(), acceptedAnswer) }),
  },
  pictionary: {
    // Each drawing is a list of strokes; each stroke is a list of [x, y] points on a 0-100 grid.
    public: z.object({
      drawings: z.array(z.object({ strokes: z.array(z.array(point).min(2)).min(1) })).length(5),
    }),
    secret: z.object({ words: z.array(acceptedAnswer).length(5) }),
  },
  escape_room: {
    // Only stages up to the current one are sent to players.
    public: z.object({
      intro: text,
      stages: z.array(z.object({ title: text, prompt: text, imageUrl: url.optional() })).length(4),
    }),
    secret: z.object({
      stages: z.array(z.object({ answer: acceptedAnswer, hint: text })).length(4),
    }),
  },
  riddle: {
    public: z.object({ riddles: z.array(text).length(3) }),
    secret: z.object({
      answers: z.array(acceptedAnswer).length(3),
      clues: z.array(text).length(3),
    }),
  },
  ethical_dilemma: {
    public: z.object({ scenario: text, options: z.array(text).length(4) }),
    secret: z.object({}),
  },
  data_story: {
    public: z.object({
      // The dashboard heading. Optional; content saved without it still loads.
      title: text.optional(),
      charts: z
        .array(
          z.object({
            id: text,
            title: text,
            type: z.enum(['bar', 'line', 'pie']),
            data: z.array(z.object({ label: text, value: z.number() })).min(1),
          }),
        )
        .min(1),
      questions: z.array(text).length(3),
    }),
    secret: z.object({
      answers: z.array(acceptedAnswer).length(3),
      hintChartIds: z.array(text).length(3),
    }),
  },
} satisfies Record<TaskKey, { public: z.ZodType; secret: z.ZodType }>;

// Every Guess the Celebrity photo needs at least one accepted name.
export function celebrityNamesMissing(
  publicData: TaskPublicContent<'guess_celebrity'>,
  secretData: TaskSecretContent<'guess_celebrity'>,
): string[] {
  return publicData.faces.filter((f) => !secretData.names[f.id]).map((f) => f.id);
}

export type TaskPublicContent<K extends TaskKey> = z.infer<
  (typeof TaskContentSchemas)[K]['public']
>;
export type TaskSecretContent<K extends TaskKey> = z.infer<
  (typeof TaskContentSchemas)[K]['secret']
>;

// One team's Find the Code puzzle, made at game start. Stored on the team's fragment row.
// Only encodedMessage and visibleKey are shown to the team; hiddenKey is the fragment.
export interface FindCodeCipher {
  word: string;
  encodedMessage: string[];
  visibleKey: { symbol: string; letter: string }[];
  hiddenKey: { symbol: string; letter: string }[];
}

export function parseTaskContent<K extends TaskKey>(
  key: K,
  content: { publicData: unknown; secretData: unknown },
): { publicData: TaskPublicContent<K>; secretData: TaskSecretContent<K> } {
  const schemas = TaskContentSchemas[key];
  const parsed = {
    publicData: schemas.public.parse(content.publicData) as TaskPublicContent<K>,
    secretData: schemas.secret.parse(content.secretData) as TaskSecretContent<K>,
  };
  if (key === 'guess_celebrity') {
    const missing = celebrityNamesMissing(
      parsed.publicData as TaskPublicContent<'guess_celebrity'>,
      parsed.secretData as TaskSecretContent<'guess_celebrity'>,
    );
    if (missing.length > 0) throw new Error(`No accepted names for photo ${missing.join(', ')}`);
  }
  return parsed;
}
