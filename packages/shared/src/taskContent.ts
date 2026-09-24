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
    public: z.object({ intro: text, encodedMessage: text, visibleKey: z.array(keyPair).min(1) }),
    // hiddenKey is the half of the key given out as fragments; hints also reveal from it.
    secret: z.object({ answer: acceptedAnswer, hiddenKey: z.array(keyPair).min(1) }),
  },
  picture_puzzle: {
    public: z.object({
      title: text,
      imageUrl: url,
      rows: z.number().int().min(2),
      cols: z.number().int().min(2),
    }),
    // The solved order is tile 0..n-1; the server scrambles and checks it.
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
  sound_sleuth: {
    public: z.object({ audioUrl: url, questions: z.array(text).length(3) }),
    secret: z.object({
      answers: z.array(acceptedAnswer).length(3),
      clueTranscripts: z.array(text).length(3),
    }),
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

export type TaskPublicContent<K extends TaskKey> = z.infer<
  (typeof TaskContentSchemas)[K]['public']
>;
export type TaskSecretContent<K extends TaskKey> = z.infer<
  (typeof TaskContentSchemas)[K]['secret']
>;

export function parseTaskContent<K extends TaskKey>(
  key: K,
  content: { publicData: unknown; secretData: unknown },
): { publicData: TaskPublicContent<K>; secretData: TaskSecretContent<K> } {
  const schemas = TaskContentSchemas[key];
  return {
    publicData: schemas.public.parse(content.publicData) as TaskPublicContent<K>,
    secretData: schemas.secret.parse(content.secretData) as TaskSecretContent<K>,
  };
}
