import {
  GameSettingsSchema,
  TASK_DEFINITIONS,
  type GameSettings,
  type TaskKey,
} from '@magic-potion/shared';

// The settings editor shows every rule number as a plain form field. Times are typed in minutes
// (or seconds where they are short), so nobody edits JSON or counts seconds. This file turns
// settings into text fields and back, and says what is wrong in plain words.

export type Unit = 'minutes' | 'seconds' | 'points' | 'count' | 'percent' | 'times';

export interface FieldDef {
  key: string;
  label: string;
  unit: Unit;
  help?: string;
  // Whole numbers only (every setting except minutes, the click tolerance and a multiplier).
  whole: boolean;
  min: number;
  max?: number;
  get: (s: GameSettings) => number;
  set: (s: GameSettings, value: number) => void;
}

export interface FieldGroup {
  title: string;
  // Part of the score formula: locked with the rest when Round 1 starts.
  scoring?: boolean;
  fields: FieldDef[];
}

const MINUTE = 60;

function minutes(
  key: string,
  label: string,
  get: (s: GameSettings) => number,
  set: (s: GameSettings, seconds: number) => void,
  help?: string,
  min = 0.5,
): FieldDef {
  return {
    key,
    label,
    unit: 'minutes',
    help,
    whole: false,
    min,
    max: 24 * 60,
    get: (s) => get(s) / MINUTE,
    set: (s, v) => set(s, Math.round(v * MINUTE)),
  };
}

function whole(
  key: string,
  label: string,
  unit: Unit,
  get: (s: GameSettings) => number,
  set: (s: GameSettings, value: number) => void,
  opts: { min?: number; max?: number; help?: string } = {},
): FieldDef {
  return {
    key,
    label,
    unit,
    whole: true,
    min: opts.min ?? 0,
    max: opts.max,
    help: opts.help,
    get,
    set,
  };
}

const taskTimer = (key: TaskKey, name: string): FieldDef =>
  minutes(
    `timer.${key}`,
    name,
    (s) => s.tasks.timerSeconds[key] ?? 0,
    (s, v) => {
      s.tasks.timerSeconds[key] = v;
    },
  );

const releaseTime = (i: number): FieldDef =>
  minutes(
    `inbox.release.${i}`,
    `Bonus task ${i + 1} arrives after`,
    (s) => s.inbox.releaseAtPlaySeconds[i] ?? 0,
    (s, v) => {
      s.inbox.releaseAtPlaySeconds[i] = v;
    },
    'Minutes of play time (the Pause does not count).',
    0,
  );

export const FIELD_GROUPS: FieldGroup[] = [
  {
    title: 'Starting funds',
    fields: [
      whole(
        'funds.task',
        'Task Funds',
        'points',
        (s) => s.funds.taskFundsStart,
        (s, v) => {
          s.funds.taskFundsStart = v;
        },
      ),
      whole(
        'funds.support',
        'Support Funds',
        'points',
        (s) => s.funds.supportFundsStart,
        (s, v) => {
          s.funds.supportFundsStart = v;
        },
      ),
    ],
  },
  {
    title: 'Game phases',
    fields: [
      minutes(
        'phase.round1',
        'Round 1',
        (s) => s.phases.round1Seconds,
        (s, v) => {
          s.phases.round1Seconds = v;
        },
      ),
      minutes(
        'phase.pause',
        'Pause',
        (s) => s.phases.pauseSeconds,
        (s, v) => {
          s.phases.pauseSeconds = v;
        },
      ),
      minutes(
        'phase.round2',
        'Round 2',
        (s) => s.phases.round2Seconds,
        (s, v) => {
          s.phases.round2Seconds = v;
        },
      ),
    ],
  },
  {
    title: 'Tasks',
    fields: [
      whole(
        'tasks.hintCost',
        'Hint cost',
        'points',
        (s) => s.tasks.hintCost,
        (s, v) => {
          s.tasks.hintCost = v;
        },
      ),
      whole(
        'tasks.hints',
        'Hints per try',
        'count',
        (s) => s.tasks.hintsPerAttempt,
        (s, v) => {
          s.tasks.hintsPerAttempt = v;
        },
        { max: 10 },
      ),
      whole(
        'tasks.failPenalty',
        'Fail penalty',
        'points',
        (s) => s.tasks.failPenalty,
        (s, v) => {
          s.tasks.failPenalty = v;
        },
      ),
      whole(
        'tasks.lockoutAttempts',
        'Wrong codes before a lock',
        'count',
        (s) => s.tasks.lockoutAttempts,
        (s, v) => {
          s.tasks.lockoutAttempts = v;
        },
        { min: 1, max: 20, help: 'The Vault, Find the Code and Escape Room.' },
      ),
      whole(
        'tasks.hangman',
        'Hangman wrong letters allowed',
        'count',
        (s) => s.tasks.hangmanMaxWrong,
        (s, v) => {
          s.tasks.hangmanMaxWrong = v;
        },
        { min: 1, max: 20 },
      ),
      whole(
        'tasks.puzzleRows',
        'Picture Puzzle rows',
        'count',
        (s) => s.tasks.picturePuzzleGrid.rows,
        (s, v) => {
          s.tasks.picturePuzzleGrid.rows = v;
        },
        { min: 2, max: 6 },
      ),
      whole(
        'tasks.puzzleCols',
        'Picture Puzzle columns',
        'count',
        (s) => s.tasks.picturePuzzleGrid.cols,
        (s, v) => {
          s.tasks.picturePuzzleGrid.cols = v;
        },
        { min: 2, max: 6 },
      ),
      {
        key: 'tasks.spotTolerance',
        label: 'Spot the Difference click room',
        unit: 'percent',
        help: 'Of the image width. A click this close to a difference still counts.',
        whole: false,
        min: 0,
        max: 20,
        get: (s) => s.tasks.spotDifferenceTolerancePercent,
        set: (s, v) => {
          s.tasks.spotDifferenceTolerancePercent = v;
        },
      },
      whole(
        'tasks.celebrityFaces',
        'Guess the Celebrity photos per try',
        'count',
        (s) => s.tasks.guessCelebrityFaces,
        (s, v) => {
          s.tasks.guessCelebrityFaces = v;
        },
        { min: 1, max: 30 },
      ),
      whole(
        'tasks.poolRiddle',
        'Riddles per try',
        'count',
        (s) => s.tasks.poolPerTry.riddle,
        (s, v) => {
          s.tasks.poolPerTry.riddle = v;
        },
        { min: 1, max: 20, help: 'Drawn from the pool. Each new try gets a fresh set.' },
      ),
      whole(
        'tasks.poolDataStory',
        'Data Story questions per try',
        'count',
        (s) => s.tasks.poolPerTry.data_story,
        (s, v) => {
          s.tasks.poolPerTry.data_story = v;
        },
        { min: 1, max: 20 },
      ),
      whole(
        'tasks.poolPictionary',
        'Pictionary drawings per try',
        'count',
        (s) => s.tasks.poolPerTry.pictionary,
        (s, v) => {
          s.tasks.poolPerTry.pictionary = v;
        },
        { min: 1, max: 20 },
      ),
    ],
  },
  {
    title: 'Task timers',
    fields: TASK_DEFINITIONS.map((d) => taskTimer(d.key, d.name)),
  },
  {
    title: 'Chat and transfers',
    fields: [
      whole(
        'chat.messages',
        'Messages per team per round',
        'count',
        (s) => s.chat.messagesPerRound,
        (s, v) => {
          s.chat.messagesPerRound = v;
        },
        { min: 1, max: 100 },
      ),
      whole(
        'chat.maxLength',
        'Longest message',
        'count',
        (s) => s.chat.maxLength,
        (s, v) => {
          s.chat.maxLength = v;
        },
        { min: 10, max: 1000, help: 'Letters and spaces.' },
      ),
      whole(
        'transfers.delay',
        'Transfer arrives after',
        'seconds',
        (s) => s.transfers.delaySeconds,
        (s, v) => {
          s.transfers.delaySeconds = v;
        },
        { max: 600 },
      ),
    ],
  },
  {
    title: 'Inbox bonus tasks',
    fields: [
      releaseTime(0),
      releaseTime(1),
      releaseTime(2),
      whole(
        'inbox.reward',
        'Points for each bonus task',
        'points',
        (s) => s.inbox.reward,
        (s, v) => {
          s.inbox.reward = v;
        },
      ),
      whole(
        'inbox.attempts',
        'Tries per bonus question',
        'count',
        (s) => s.inbox.answerAttempts,
        (s, v) => {
          s.inbox.answerAttempts = v;
        },
        { min: 1, max: 20 },
      ),
    ],
  },
  {
    title: 'Scoring',
    scoring: true,
    fields: [
      whole(
        'scoring.perTask',
        'Points for each task solved',
        'points',
        (s) => s.scoring.pointsPerTask,
        (s, v) => {
          s.scoring.pointsPerTask = v;
        },
      ),
      whole(
        'scoring.timeBonus',
        'Time bonus per second left',
        'points',
        (s) => s.scoring.timeBonusPerSecond,
        (s, v) => {
          s.scoring.timeBonusPerSecond = v;
        },
        { help: 'Only when a team finishes all 5 tasks.' },
      ),
      whole(
        'scoring.taskFunds',
        'Task Funds at the end count',
        'times',
        (s) => s.scoring.taskFundsMultiplier,
        (s, v) => {
          s.scoring.taskFundsMultiplier = v;
        },
      ),
      {
        key: 'scoring.collaboration',
        label: 'Funds given count',
        unit: 'times',
        whole: false,
        min: 0,
        max: 100,
        get: (s) => s.scoring.collaborationMultiplier,
        set: (s, v) => {
          s.scoring.collaborationMultiplier = v;
        },
      },
      whole(
        'scoring.collaborationCap',
        'Most points from funds given',
        'points',
        (s) => s.scoring.collaborationCap,
        (s, v) => {
          s.scoring.collaborationCap = v;
        },
      ),
      whole(
        'scoring.received',
        'Funds received take away',
        'times',
        (s) => s.scoring.receivedMultiplier,
        (s, v) => {
          s.scoring.receivedMultiplier = v;
        },
      ),
      whole(
        'scoring.potionBonus',
        'Full Potion Bonus',
        'points',
        (s) => s.scoring.fullPotionBonus,
        (s, v) => {
          s.scoring.fullPotionBonus = v;
        },
        { help: 'Every team gets it if the potion is full at the Reveal.' },
      ),
    ],
  },
];

export const ALL_FIELDS: FieldDef[] = FIELD_GROUPS.flatMap((g) => g.fields);

// The form: one text value per field, plus the lock lengths as a list (in seconds).
export interface SettingsForm {
  values: Record<string, string>;
  lockoutSeconds: string[];
}

export type FormErrors = Record<string, string>;

export const LOCKOUT_KEY = 'tasks.lockoutSeconds';

// Up to 2 decimals, without trailing zeros: 0.5, 12, 1.25.
function show(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function toForm(settings: GameSettings): SettingsForm {
  return {
    values: Object.fromEntries(ALL_FIELDS.map((f) => [f.key, show(f.get(settings))])),
    lockoutSeconds: settings.tasks.lockoutSeconds.map(String),
  };
}

// Commas and spaces are allowed as thousands separators: "10,000".
function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function checkField(f: FieldDef, text: string): number | string {
  const n = parseNumber(text);
  if (n === null) return 'Enter a number.';
  if (f.whole && !Number.isInteger(n)) return 'Enter a whole number.';
  if (n < f.min) return `Enter ${show(f.min)} or more.`;
  if (f.max !== undefined && n > f.max) return `Enter ${show(f.max)} or less.`;
  return n;
}

// New settings from the form, on top of `base` (branding and anything not in the form).
export function fromForm(
  base: GameSettings,
  form: SettingsForm,
): { ok: true; settings: GameSettings } | { ok: false; errors: FormErrors } {
  const settings = structuredClone(base);
  const errors: FormErrors = {};
  for (const f of ALL_FIELDS) {
    const result = checkField(f, form.values[f.key] ?? '');
    if (typeof result === 'string') errors[f.key] = result;
    else f.set(settings, result);
  }

  const locks = form.lockoutSeconds.map(parseNumber);
  if (locks.length === 0) errors[LOCKOUT_KEY] = 'Add at least one lock length.';
  else if (locks.some((n) => n === null || !Number.isInteger(n) || n < 1 || n > 3600)) {
    errors[LOCKOUT_KEY] = 'Each lock length is a whole number of seconds, from 1 to 3600.';
  } else settings.tasks.lockoutSeconds = locks as number[];

  const [first, second, third] = settings.inbox.releaseAtPlaySeconds;
  if (!errors['inbox.release.1'] && second! < first!) {
    errors['inbox.release.1'] = 'Must be the same as bonus task 1 or later.';
  }
  if (!errors['inbox.release.2'] && third! < second!) {
    errors['inbox.release.2'] = 'Must be the same as bonus task 2 or later.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  // The server checks again; this catches anything the fields above missed.
  const parsed = GameSettingsSchema.safeParse(settings);
  if (!parsed.success) return { ok: false, errors: { form: 'Some settings are not valid.' } };
  return { ok: true, settings: parsed.data };
}

export function unitLabel(unit: Unit): string {
  return { minutes: 'min', seconds: 'sec', points: 'points', count: '', percent: '%', times: 'x' }[
    unit
  ];
}
