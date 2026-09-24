import { z } from 'zod';
import { TaskKeySchema } from './taskKeys';

// Every rule number from docs/GAME_RULES.md is a per-game setting.
// Money and times are whole numbers; times are in seconds.

const money = z.number().int().nonnegative();
const seconds = z.number().int().positive();
const count = z.number().int().positive();
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const MIN_TEAMS = 3;
export const MAX_TEAMS = 25;

export const GameSettingsSchema = z.object({
  branding: z.object({
    clientName: z.string().max(100),
    logoUrl: z.url().nullable(),
    primaryColor: hexColor,
    accentColor: hexColor,
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
    lockoutSeconds: seconds,
    hangmanMaxWrong: count,
    timerSeconds: z.record(TaskKeySchema, seconds),
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
