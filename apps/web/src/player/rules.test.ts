import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@magic-potion/shared';
import { minutesText, rulesPlainText, rulesSections } from './rules';
import { FORBIDDEN } from './test/forbidden';

describe('Rules text', () => {
  it('has the approved sections in order', () => {
    expect(rulesSections(DEFAULT_SETTINGS).map((s) => s.title)).toEqual([
      'The goal',
      'Time',
      'Your tasks',
      'Hints',
      'Found items',
      'Funds',
      'Chat',
      'Inbox',
      'Leaderboard',
      'Your score',
    ]);
  });

  it('uses the default numbers from GAME_RULES', () => {
    const text = rulesPlainText(DEFAULT_SETTINGS);
    for (const phrase of [
      'bonus of 15,000 points',
      'two rounds of 35 minutes, with a 10-minute pause',
      'worth 10,000 points',
      'you lose 3,500 Task Funds',
      'lock for 60 seconds after 3 wrong tries',
      'A hint costs 1,500',
      'A hint is blocked if it would take your Task Funds below zero.',
      'Task Funds start at 10,000',
      'Support Funds start at 4,500',
      'They arrive 60 seconds after you send them',
      '5 messages in each round, up to 300 characters each',
      '3 bonus tasks arrive during the game. Each is worth 1,000 points',
      'Funds given: 1.5 points for every 1 you give, up to 10,000',
      'Task Funds count twice in your score',
    ]) {
      expect(text).toContain(phrase);
    }
  });

  it('follows the game settings when the admin changes them', () => {
    const s = structuredClone(DEFAULT_SETTINGS);
    s.tasks.hintCost = 2_000;
    s.chat.messagesPerRound = 8;
    s.phases = { round1Seconds: 300, pauseSeconds: 60, round2Seconds: 300 };
    const text = rulesPlainText(s);
    expect(text).toContain('A hint costs 2,000');
    expect(text).toContain('8 messages in each round');
    expect(text).toContain('two rounds of 5 minutes, with a 1-minute pause');
  });

  it('keeps the approved Found items and Leaderboard wording exactly', () => {
    const sections = rulesSections(DEFAULT_SETTINGS);
    expect(sections.find((s) => s.title === 'Found items')?.paragraphs).toEqual([
      "Some tasks can't be solved with what's on your screen alone. Look carefully at what you have and what you're missing.",
    ]);
    expect(sections.find((s) => s.title === 'Leaderboard')?.paragraphs).toEqual([
      "The leaderboard shows your team's progress and score.",
    ]);
  });

  it('never tells teams to cooperate or explains the rounds', () => {
    const text = rulesPlainText(DEFAULT_SETTINGS);
    for (const pattern of FORBIDDEN) expect(text).not.toMatch(pattern);
  });

  it('writes times in plain words', () => {
    expect(minutesText(600)).toBe('10 minutes');
    expect(minutesText(60)).toBe('1 minute');
    expect(minutesText(45)).toBe('45 seconds');
  });
});
