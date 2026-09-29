import { z } from 'zod';
import type { GameSettings } from './settings';
import { TaskContentSchemas } from './taskContent';
import { TASK_DEFINITIONS, TASK_KEYS, UNIQUE_TASKS_PER_TEAM, type TaskKey } from './taskKeys';

// Content packs (Phase 6B): reusable task content, edited in forms. A pack holds items:
// - pool tasks: one item is one question (a riddle, a phrase, a scenario, a drawing, a photo);
//   each try draws from the pool;
// - variant tasks: one item is one whole puzzle, used in turn when a team restarts.
// Messages are plain English: the admin panel shows them in red beside the field.

export const POOL_TASK_KEYS = [
  'riddle',
  'hangman',
  'ethical_dilemma',
  'pictionary',
  'guess_celebrity',
] as const satisfies readonly TaskKey[];
export type PoolTaskKey = (typeof POOL_TASK_KEYS)[number];

export function isPoolTask(key: TaskKey): key is PoolTaskKey {
  return (POOL_TASK_KEYS as readonly TaskKey[]).includes(key);
}

// Pool tasks that can be filled from a spreadsheet (Data Story imports questions into a dashboard).
export const IMPORT_TASK_KEYS = [
  'riddle',
  'hangman',
  'ethical_dilemma',
  'data_story',
] as const satisfies readonly TaskKey[];
export type ImportTaskKey = (typeof IMPORT_TASK_KEYS)[number];

const filled = (message: string) => z.string().trim().min(1, message);
const answers = z
  .array(z.string().trim().min(1, 'An accepted answer cannot be empty.'))
  .min(1, 'Add at least one accepted answer.');
const point = z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]);

export const DIFFERENCES_NEEDED = 7;
export const DILEMMA_OPTIONS = 4;

const PACK_ITEM_SCHEMAS = {
  riddle: {
    public: z.object({ riddle: filled('Write the riddle.') }),
    secret: z.object({ answers, clue: filled('Write a clue. It is the hint.') }),
  },
  hangman: {
    public: z.object({ category: filled('Write a category, such as "Film".') }),
    secret: z.object({
      phrase: filled('Write the phrase.')
        .max(28, 'Keep the phrase to 28 letters or fewer, so it fits on screen.')
        .regex(/^[A-Za-z][A-Za-z' -]*$/, 'Use letters, spaces, hyphens and apostrophes only.')
        .refine(
          (p) => p.split(/\s+/).every((w) => w.length <= 12),
          'Each word can have at most 12 letters, so it fits on one line.',
        ),
    }),
  },
  ethical_dilemma: {
    public: z.object({
      scenario: filled('Write the scenario.'),
      options: z
        .array(filled('Write this option.'))
        .length(DILEMMA_OPTIONS, `A dilemma needs ${DILEMMA_OPTIONS} options.`),
    }),
    secret: z.object({}),
  },
  pictionary: {
    public: z.object({
      strokes: z.array(z.array(point).min(2)).min(1, 'Draw the picture first.'),
    }),
    secret: z.object({ word: answers }),
  },
  guess_celebrity: {
    public: z.object({ imageUrl: filled('Upload a photo.') }),
    secret: z.object({ names: answers }),
  },
  spot_difference: {
    // Both pictures must be the same size, so a mark on one is in the same place on the other.
    public: z
      .object({
        leftImageUrl: filled('Upload the original picture.'),
        rightImageUrl: filled('Upload the changed picture.'),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        rightWidth: z.number().int().positive(),
        rightHeight: z.number().int().positive(),
      })
      .refine((p) => p.width === p.rightWidth && p.height === p.rightHeight, {
        message: 'The two pictures must be the same size.',
        path: ['rightImageUrl'],
      }),
    secret: z.object({
      areas: z
        .array(z.object({ x: z.number(), y: z.number(), r: z.number().positive() }))
        .superRefine((areas, ctx) => {
          if (areas.length !== DIFFERENCES_NEEDED) {
            const left = DIFFERENCES_NEEDED - areas.length;
            ctx.addIssue({
              code: 'custom',
              message:
                left > 0
                  ? `Mark ${DIFFERENCES_NEEDED} differences: ${areas.length} marked, ${left} to go.`
                  : `Mark exactly ${DIFFERENCES_NEEDED} differences: remove ${-left}.`,
            });
          }
        }),
    }),
  },
  // Every other task: one item is a whole puzzle in the same shape the game uses.
  vault: TaskContentSchemas.vault,
  find_code: TaskContentSchemas.find_code,
  picture_puzzle: TaskContentSchemas.picture_puzzle,
  alien_translator: TaskContentSchemas.alien_translator,
  escape_room: TaskContentSchemas.escape_room,
  data_story: TaskContentSchemas.data_story,
} satisfies Record<TaskKey, { public: z.ZodType; secret: z.ZodType }>;

export interface PackItemData {
  publicData: unknown;
  secretData: unknown;
}

export interface PackItem extends PackItemData {
  id: string;
  taskKey: TaskKey;
  position: number;
}

export interface ItemError {
  // Where the problem is, for example "public.options.1" or "secret.answers".
  path: string;
  message: string;
}

// Every problem with one item, or none.
export function checkPackItem(key: TaskKey, item: PackItemData): ItemError[] {
  const schemas = PACK_ITEM_SCHEMAS[key];
  const errors: ItemError[] = [];
  for (const [side, schema, data] of [
    ['public', schemas.public, item.publicData],
    ['secret', schemas.secret, item.secretData],
  ] as const) {
    const result = (schema as z.ZodType).safeParse(data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({ path: [side, ...issue.path].join('.'), message: friendly(issue) });
      }
    }
  }
  if (key === 'data_story' && errors.length === 0) errors.push(...dataStoryErrors(item));
  return errors;
}

// Each Data Story question needs its answers and a chart to look at (the hint).
function dataStoryErrors(item: PackItemData): ItemError[] {
  const pub = item.publicData as { charts: { id: string }[]; questions: string[] };
  const sec = item.secretData as { answers: unknown[]; hintChartIds: string[] };
  const errors: ItemError[] = [];
  if (sec.answers.length !== pub.questions.length) {
    errors.push({ path: 'secret.answers', message: 'Every question needs its accepted answers.' });
  }
  if (sec.hintChartIds.length !== pub.questions.length) {
    errors.push({
      path: 'secret.hintChartIds',
      message: 'Every question needs a chart to look at.',
    });
  }
  const ids = new Set(pub.charts.map((c) => c.id));
  sec.hintChartIds.forEach((id, i) => {
    if (!ids.has(id)) {
      errors.push({ path: `secret.hintChartIds.${i}`, message: 'Choose one of the charts.' });
    }
  });
  return errors;
}

// Zod's own wording for a missing field or wrong type is technical; say it plainly.
function friendly(issue: z.core.$ZodIssue): string {
  if (issue.code === 'invalid_type') return 'This is missing.';
  return issue.message;
}

// The item as saved, with spaces trimmed. Only call on an item with no errors.
export function cleanPackItem(key: TaskKey, item: PackItemData): PackItemData {
  const schemas = PACK_ITEM_SCHEMAS[key];
  return {
    publicData: (schemas.public as z.ZodType).parse(item.publicData),
    secretData: (schemas.secret as z.ZodType).parse(item.secretData),
  };
}

// ---------- Pack options ----------

export const PackOptionsSchema = z.object({
  guessCelebrityTaskName: z.string().trim().min(1).max(40).default('Guess the Celebrity'),
});
export type PackOptions = z.infer<typeof PackOptionsSchema>;

// ---------- Turning a pack into a game's content ----------

export interface GameContentRow {
  key: TaskKey;
  variant: number;
  publicData: unknown;
  secretData: unknown;
}

interface Parsed<T> {
  id: string;
  publicData: T extends { public: infer P extends z.ZodType } ? z.infer<P> : never;
  secretData: T extends { secret: infer S extends z.ZodType } ? z.infer<S> : never;
}

function valid<K extends TaskKey>(
  key: K,
  items: readonly PackItem[],
): Parsed<(typeof PACK_ITEM_SCHEMAS)[K]>[] {
  return items
    .filter((i) => i.taskKey === key && checkPackItem(key, i).length === 0)
    .sort((a, b) => a.position - b.position)
    .map((i) => ({ id: i.id, ...cleanPackItem(key, i) }) as Parsed<(typeof PACK_ITEM_SCHEMAS)[K]>);
}

// The game's TaskContent rows for a pack. Items with problems are left out. Pool tasks become one
// row holding the whole pool; variant tasks one row per item. Ethical Dilemma keeps only the
// chosen scenario (or the first one), so every team gets the same one.
export function compileGameContent(
  items: readonly PackItem[],
  options: PackOptions,
  dilemmaItemId: string | null,
): GameContentRow[] {
  const rows: GameContentRow[] = [];
  const one = (key: TaskKey, publicData: unknown, secretData: unknown) =>
    rows.push({ key, variant: 1, publicData, secretData });

  const riddles = valid('riddle', items);
  if (riddles.length) {
    one(
      'riddle',
      { riddles: riddles.map((r) => r.publicData.riddle) },
      {
        answers: riddles.map((r) => r.secretData.answers),
        clues: riddles.map((r) => r.secretData.clue),
      },
    );
  }
  const phrases = valid('hangman', items);
  if (phrases.length) {
    one(
      'hangman',
      { categories: phrases.map((p) => p.publicData.category) },
      { phrases: phrases.map((p) => p.secretData.phrase) },
    );
  }
  const drawings = valid('pictionary', items);
  if (drawings.length) {
    one(
      'pictionary',
      { drawings: drawings.map((d) => ({ strokes: d.publicData.strokes })) },
      { words: drawings.map((d) => d.secretData.word) },
    );
  }
  const faces = valid('guess_celebrity', items);
  if (faces.length) {
    one(
      'guess_celebrity',
      {
        taskName: options.guessCelebrityTaskName,
        // The item id, never the person's name.
        faces: faces.map((f) => ({ id: f.id, imageUrl: f.publicData.imageUrl })),
      },
      { names: Object.fromEntries(faces.map((f) => [f.id, f.secretData.names])) },
    );
  }
  const dilemmas = valid('ethical_dilemma', items);
  const dilemma = dilemmas.find((d) => d.id === dilemmaItemId) ?? dilemmas[0];
  if (dilemma) one('ethical_dilemma', dilemma.publicData, {});

  for (const key of TASK_KEYS) {
    if (isPoolTask(key)) continue;
    valid(key, items).forEach((item, i) => {
      const publicData = { ...(item.publicData as Record<string, unknown>) };
      if (key === 'spot_difference') {
        delete publicData['rightWidth'];
        delete publicData['rightHeight'];
      }
      rows.push({ key, variant: i + 1, publicData, secretData: item.secretData });
    });
  }
  return rows;
}

// ---------- Readiness ----------

export interface TaskReadiness {
  key: TaskKey;
  name: string;
  // Items that can be played, and items with problems (left out of games).
  count: number;
  invalid: number;
  // "12 riddles", "1 puzzle".
  label: string;
}

export interface PackReadiness {
  // False when a game with this pack could not start.
  ready: boolean;
  // Why it cannot start.
  problems: string[];
  // Things that work but may not be what the admin wants.
  warnings: string[];
  tasks: TaskReadiness[];
}

const NOUN: Record<TaskKey, [string, string]> = {
  vault: ['puzzle', 'puzzles'],
  find_code: ['puzzle', 'puzzles'],
  picture_puzzle: ['picture', 'pictures'],
  hangman: ['phrase', 'phrases'],
  spot_difference: ['picture pair', 'picture pairs'],
  alien_translator: ['message', 'messages'],
  guess_celebrity: ['photo', 'photos'],
  pictionary: ['drawing', 'drawings'],
  escape_room: ['room', 'rooms'],
  riddle: ['riddle', 'riddles'],
  ethical_dilemma: ['scenario', 'scenarios'],
  data_story: ['dashboard', 'dashboards'],
};

export function countLabel(key: TaskKey, n: number): string {
  const [one, many] = NOUN[key];
  return `${n} ${n === 1 ? one : many}`;
}

export function packReadiness(
  items: readonly PackItem[],
  tasks: Pick<GameSettings['tasks'], 'poolPerTry' | 'guessCelebrityFaces'>,
): PackReadiness {
  const problems: string[] = [];
  const warnings: string[] = [];
  const perTask = TASK_DEFINITIONS.map((def): TaskReadiness => {
    const mine = items.filter((i) => i.taskKey === def.key);
    const invalid = mine.filter((i) => checkPackItem(def.key, i).length > 0).length;
    const count = mine.length - invalid;
    return { key: def.key, name: def.name, count, invalid, label: countLabel(def.key, count) };
  });

  for (const t of perTask) {
    const def = TASK_DEFINITIONS.find((d) => d.key === t.key)!;
    if (t.invalid > 0) {
      warnings.push(
        `${t.name}: ${t.invalid} ${t.invalid === 1 ? 'entry needs' : 'entries need'} fixing and ${t.invalid === 1 ? 'is' : 'are'} left out.`,
      );
    }
    if (def.type === 'COMMON' && t.count === 0) problems.push(`${t.name} needs content.`);
  }
  const uniqueWithContent = perTask.filter(
    (t) => TASK_DEFINITIONS.find((d) => d.key === t.key)!.type === 'UNIQUE' && t.count > 0,
  ).length;
  if (uniqueWithContent < UNIQUE_TASKS_PER_TEAM) {
    problems.push(
      `At least ${UNIQUE_TASKS_PER_TEAM} of the other tasks need content (${uniqueWithContent} have it now).`,
    );
  }

  const short = (key: TaskKey, perTry: number, what: string) => {
    const t = perTask.find((x) => x.key === key)!;
    if (t.count > 0 && t.count < perTry) {
      warnings.push(
        `${t.name}: ${t.label} in the pool but ${perTry} ${what} per try, so each try gets only ${t.count}.`,
      );
    }
  };
  short('riddle', tasks.poolPerTry.riddle, 'riddles');
  short('pictionary', tasks.poolPerTry.pictionary, 'drawings');
  short('guess_celebrity', tasks.guessCelebrityFaces, 'photos');
  for (const d of valid('data_story', items)) {
    if (d.publicData.questions.length < tasks.poolPerTry.data_story) {
      warnings.push(
        `Data Story: a dashboard has ${d.publicData.questions.length} questions but ${tasks.poolPerTry.data_story} are asked per try.`,
      );
    }
  }
  return { ready: problems.length === 0, problems, warnings, tasks: perTask };
}
