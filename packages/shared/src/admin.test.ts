import { describe, expect, it } from 'vitest';
import {
  AddTeamsSchema,
  CreateGameSchema,
  PASSWORD_WORDS,
  TEAM_CODE_ALPHABET,
  TEAM_CODE_LENGTH,
  generateTeamCodes,
  generateTeamPassword,
  loginSheetCsv,
  type RandomInt,
} from './admin';

// A fixed sequence, repeated.
function sequence(...values: number[]): RandomInt {
  let i = 0;
  return (max) => values[i++ % values.length]! % max;
}

const mathRandom: RandomInt = (max) => Math.floor(Math.random() * max);

describe('team codes', () => {
  it('uses only letters and digits that cannot be mixed up', () => {
    expect(TEAM_CODE_ALPHABET).not.toMatch(/[0O1IL]/);
    const codes = generateTeamCodes(25, [], mathRandom);
    for (const code of codes) {
      expect(code).toHaveLength(TEAM_CODE_LENGTH);
      expect([...code].every((c) => TEAM_CODE_ALPHABET.includes(c))).toBe(true);
    }
  });

  it('never repeats a code, within the batch or against codes already taken', () => {
    // The first code drawn is AAAAA, which is taken, then AAAAA again, then BBBBB.
    const random = sequence(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2);
    expect(generateTeamCodes(2, ['aaaaa'], random)).toEqual(['BBBBB', 'CCCCC']);
  });

  it('gives up instead of looping forever on a broken random source', () => {
    expect(() => generateTeamCodes(2, [], () => 0)).toThrow(/unique team codes/);
  });
});

describe('team passwords', () => {
  it('is three words and a digit', () => {
    const password = generateTeamPassword(sequence(0, 1, 2, 3));
    expect(password).toBe(`${PASSWORD_WORDS[0]}-${PASSWORD_WORDS[1]}-${PASSWORD_WORDS[2]}-5`);
    expect(generateTeamPassword(mathRandom)).toMatch(/^[a-z]+-[a-z]+-[a-z]+-[2-9]$/);
  });

  it('has 100 different words', () => {
    expect(new Set(PASSWORD_WORDS).size).toBe(100);
  });
});

describe('login sheet CSV', () => {
  it('quotes commas and stops formulas', () => {
    const csv = loginSheetCsv('Demo, 2026', 'https://play.example.com', [
      { code: 'K7WQP', name: '=SUM(A1)', password: 'plum-river-sun-4' },
    ]);
    expect(csv).toBe(
      'Game,Team,Team code,Password,Play at\r\n' +
        `"Demo, 2026",'=SUM(A1),K7WQP,plum-river-sun-4,https://play.example.com\r\n`,
    );
  });
});

describe('admin schemas', () => {
  it('keeps the team count within 3 to 25', () => {
    expect(CreateGameSchema.safeParse({ name: 'A', teamCount: 2 }).success).toBe(false);
    expect(CreateGameSchema.safeParse({ name: 'A', teamCount: 26 }).success).toBe(false);
    expect(CreateGameSchema.parse({ name: ' A ', teamCount: 3 })).toEqual({
      name: 'A',
      clientName: '',
      teamCount: 3,
    });
  });

  it('allows adding teams without names', () => {
    expect(AddTeamsSchema.parse({ count: 2 })).toEqual({ count: 2, names: [] });
  });
});
