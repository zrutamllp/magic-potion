import { z } from 'zod';
import { TaskKeySchema } from './taskKeys';

// Every rule number from docs/GAME_RULES.md is a per-game setting.
// Money and times are whole numbers; times are in seconds.

const money = z.number().int().nonnegative();
const seconds = z.number().int().positive();
const count = z.number().int().positive();
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const MIN_TEAMS = 3;

function replaceSoundSleuthTimer(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('sound_sleuth' in value)) return value;
  const timers: Record<string, unknown> = { guess_celebrity: 8 * 60, ...value };
  delete timers['sound_sleuth'];
  return timers;
}
export const MAX_TEAMS = 25;

export const GameSettingsSchema = z.object({
  branding: z.object({
    clientName: z.string().max(100),
    logoUrl: z.url().nullable(),
    primaryColor: hexColor,
    accentColor: hexColor,
    // Played in the Lobby. Optional; games saved before it existed load with none.
    introVideoUrl: z.url().nullable().default(null),
  }),
  funds: z.object({
    taskFundsStart: money,
    supportFundsStart: money,
  }),
  tasks: z.object({
    hintCost: money,
    hintsPerAttempt: z.number().int().nonnegative(),
    failPenalty: money,
    lockoutAttempts: count,
    // Lock lengths after each run of wrong tries: the 1st lock, the 2nd, ... The last one repeats.
    // Games saved when this was a single number still load.
    lockoutSeconds: z.union([seconds.transform((s) => [s]), z.array(seconds).min(1)]),
    hangmanMaxWrong: count,
    // Picture Puzzle grid. Games saved before it was a setting load with 3x3.
    picturePuzzleGrid: z
      .object({
        rows: z.number().int().min(2).max(6),
        cols: z.number().int().min(2).max(6),
      })
      .default({ rows: 3, cols: 3 }),
    // Spot the Difference: extra room around every difference, as a % of the image width,
    // so trackpad clicks near a difference still count.
    spotDifferenceTolerancePercent: z.number().min(0).max(20).default(4),
    // Guess the Celebrity: photos per try. Games saved before the task existed load with 8.
    guessCelebrityFaces: count.default(8),
    // Pool tasks: how many entries each try draws from the pool (Phase 6B). Games saved before
    // pools load with the defaults. Hangman always plays one phrase per try.
    poolPerTry: z
      .object({ riddle: count, data_story: count, pictionary: count })
      .default({ riddle: 3, data_story: 3, pictionary: 5 }),
    // Games saved when Sound Sleuth was in the pool load with its timer dropped and the
    // Guess the Celebrity timer at its default (8 minutes).
    timerSeconds: z.preprocess(replaceSoundSleuthTimer, z.record(TaskKeySchema, seconds)),
  }),
  phases: z.object({
    round1Seconds: seconds,
    pauseSeconds: seconds,
    round2Seconds: seconds,
  }),
  chat: z.object({
    messagesPerRound: count,
    maxLength: count,
  }),
  transfers: z.object({
    delaySeconds: z.number().int().nonnegative(),
  }),
  inbox: z.object({
    // Play-clock seconds at which each bonus task is released.
    releaseAtPlaySeconds: z.array(z.number().int().nonnegative()).length(3),
    reward: money,
    answerAttempts: count,
  }),
  scoring: z.object({
    pointsPerTask: money,
    timeBonusPerSecond: money,
    taskFundsMultiplier: money,
    // The only non-integer setting. The bonus is rounded down (GAME_RULES section 9).
    collaborationMultiplier: z.number().nonnegative(),
    collaborationCap: money,
    receivedMultiplier: money,
    fullPotionBonus: money,
  }),
});

export type GameSettings = z.infer<typeof GameSettingsSchema>;

// Settings that feed the score formula. They lock when Round 1 starts (GAME_RULES section 12).
export const SCORING_SETTING_PATHS = [
  'scoring',
  'tasks.hintCost',
  'tasks.failPenalty',
  'inbox.reward',
] as const;
