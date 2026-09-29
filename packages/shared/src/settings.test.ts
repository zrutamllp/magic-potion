import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaultSettings';
import { GameSettingsSchema } from './settings';
import { TASK_DEFINITIONS, TASK_KEYS } from './taskKeys';

describe('DEFAULT_SETTINGS', () => {
  it('parses with the settings schema', () => {
    expect(GameSettingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it('loads settings saved before the intro video existed', () => {
    const old = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as {
      branding: Record<string, unknown>;
    };
    delete old.branding.introVideoUrl;
    expect(GameSettingsSchema.parse(old).branding.introVideoUrl).toBeNull();
  });

  it('loads settings saved before the puzzle grid and click tolerance were settings', () => {
    const old = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as { tasks: Record<string, unknown> };
    delete old.tasks.picturePuzzleGrid;
    delete old.tasks.spotDifferenceTolerancePercent;
    const tasks = GameSettingsSchema.parse(old).tasks;
    expect(tasks.picturePuzzleGrid).toEqual({ rows: 3, cols: 3 });
    expect(tasks.spotDifferenceTolerancePercent).toBe(4);
  });

  it('loads settings saved before the facilitator dashboard existed', () => {
    const old = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Record<string, unknown>;
    delete old.staff;
    expect(GameSettingsSchema.parse(old).staff).toEqual({
      coFacilitatorAdjustLimit: 2_000,
      stuckIdleSeconds: 300,
    });
  });

  it('refuses a puzzle grid outside 2 to 6', () => {
    const bad = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
    bad.tasks.picturePuzzleGrid = { rows: 1, cols: 7 };
    expect(() => GameSettingsSchema.parse(bad)).toThrow();
  });

  it('loads a single lock length saved by an older version', () => {
    const old = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as { tasks: Record<string, unknown> };
    old.tasks.lockoutSeconds = 90;
    expect(GameSettingsSchema.parse(old).tasks.lockoutSeconds).toEqual([90]);
  });

  it('matches the numbers in GAME_RULES.md', () => {
    const s = DEFAULT_SETTINGS;
    expect(s.funds).toEqual({ taskFundsStart: 10_000, supportFundsStart: 4_500 });
    expect(s.tasks.hintCost).toBe(1_500);
    expect(s.tasks.hintsPerAttempt).toBe(1);
    expect(s.tasks.failPenalty).toBe(3_500);
    expect(s.tasks.lockoutAttempts).toBe(3);
    expect(s.tasks.lockoutSeconds).toEqual([60, 120, 240]);
    expect(s.tasks.hangmanMaxWrong).toBe(6);
    expect(s.tasks.picturePuzzleGrid).toEqual({ rows: 3, cols: 3 });
    expect(s.tasks.spotDifferenceTolerancePercent).toBe(4);
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
    expect(s.staff).toEqual({ coFacilitatorAdjustLimit: 2_000, stuckIdleSeconds: 300 });
  });

  it('has the task timers from the task list', () => {
    expect(toMinutes(DEFAULT_SETTINGS.tasks.timerSeconds)).toEqual({
      vault: 12,
      find_code: 12,
      picture_puzzle: 12,
      hangman: 8,
      spot_difference: 8,
      alien_translator: 12,
      guess_celebrity: 8,
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

  it('loads settings saved when Sound Sleuth was in the task pool', () => {
    const timers: Record<string, number> = { ...DEFAULT_SETTINGS.tasks.timerSeconds };
    delete timers['guess_celebrity'];
    const tasks: Record<string, unknown> = { ...DEFAULT_SETTINGS.tasks };
    delete tasks['guessCelebrityFaces'];
    const old = {
      ...DEFAULT_SETTINGS,
      tasks: { ...tasks, timerSeconds: { ...timers, sound_sleuth: 600 } },
    };
    const parsed = GameSettingsSchema.parse(old);
    expect(parsed.tasks.timerSeconds.guess_celebrity).toBe(480);
    expect('sound_sleuth' in parsed.tasks.timerSeconds).toBe(false);
    expect(parsed.tasks.guessCelebrityFaces).toBe(8);
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
