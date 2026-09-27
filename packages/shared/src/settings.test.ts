import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaultSettings';
import { GameSettingsSchema } from './settings';
import { TASK_DEFINITIONS, TASK_KEYS } from './taskKeys';

describe('DEFAULT_SETTINGS', () => {
  it('parses with the settings schema', () => {
    expect(GameSettingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it('loads settings saved before the intro video existed', () => {
    const old = structuredClone(DEFAULT_SETTINGS) as { branding: Record<string, unknown> };
    delete old.branding.introVideoUrl;
    expect(GameSettingsSchema.parse(old).branding.introVideoUrl).toBeNull();
  });

  it('matches the numbers in GAME_RULES.md', () => {
    const s = DEFAULT_SETTINGS;
    expect(s.funds).toEqual({ taskFundsStart: 10_000, supportFundsStart: 4_500 });
    expect(s.tasks.hintCost).toBe(1_500);
    expect(s.tasks.hintsPerAttempt).toBe(1);
    expect(s.tasks.failPenalty).toBe(3_500);
    expect(s.tasks.lockoutAttempts).toBe(3);
    expect(s.tasks.lockoutSeconds).toBe(60);
    expect(s.tasks.hangmanMaxWrong).toBe(6);
    expect(s.phases).toEqual({ round1Seconds: 2_100, pauseSeconds: 600, round2Seconds: 2_100 });
    expect(s.phases.round1Seconds + s.phases.round2Seconds).toBe(4_200);
    expect(s.chat).toEqual({ messagesPerRound: 5, maxLength: 300 });
    expect(s.transfers.delaySeconds).toBe(60);
    expect(s.inbox).toEqual({
      releaseAtPlaySeconds: [600, 1_800, 3_300],
      reward: 1_000,
      answerAttempts: 3,
    });
    expect(s.scoring).toEqual({
      pointsPerTask: 10_000,
      timeBonusPerSecond: 5,
      taskFundsMultiplier: 2,
      collaborationMultiplier: 1.5,
      collaborationCap: 10_000,
      receivedMultiplier: 2,
      fullPotionBonus: 15_000,
    });
  });

  it('has the task timers from the task list', () => {
    expect(toMinutes(DEFAULT_SETTINGS.tasks.timerSeconds)).toEqual({
      vault: 12,
      find_code: 12,
      picture_puzzle: 12,
      hangman: 8,
      spot_difference: 8,
      alien_translator: 12,
      sound_sleuth: 10,
      pictionary: 8,
      escape_room: 15,
      riddle: 8,
      ethical_dilemma: 8,
      data_story: 12,
    });
    function toMinutes(timers: Record<string, number>) {
      return Object.fromEntries(Object.entries(timers).map(([k, v]) => [k, v / 60]));
    }
  });

  it('does not hard-code a client brand', () => {
    expect(DEFAULT_SETTINGS.branding.clientName).toBe('');
    expect(DEFAULT_SETTINGS.branding.logoUrl).toBeNull();
  });
});

describe('GameSettingsSchema', () => {
  it('rejects a missing task timer', () => {
    const rest: Record<string, number> = { ...DEFAULT_SETTINGS.tasks.timerSeconds };
    delete rest['vault'];
    const bad = { ...DEFAULT_SETTINGS, tasks: { ...DEFAULT_SETTINGS.tasks, timerSeconds: rest } };
    expect(GameSettingsSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects fractional money', () => {
    const bad = { ...DEFAULT_SETTINGS, tasks: { ...DEFAULT_SETTINGS.tasks, hintCost: 1_500.5 } };
    expect(GameSettingsSchema.safeParse(bad).success).toBe(false);
  });
});

describe('TASK_DEFINITIONS', () => {
  it('lists all 12 tasks: 2 common and 10 unique', () => {
    expect(TASK_DEFINITIONS.map((t) => t.key)).toEqual([...TASK_KEYS]);
    expect(TASK_DEFINITIONS.filter((t) => t.type === 'COMMON').map((t) => t.key)).toEqual([
      'vault',
      'find_code',
    ]);
    expect(TASK_DEFINITIONS.filter((t) => t.type === 'UNIQUE')).toHaveLength(10);
  });
});
