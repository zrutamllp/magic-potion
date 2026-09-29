import { describe, expect, it } from 'vitest';
import {
  checkPackItem,
  compileGameContent,
  packReadiness,
  PackOptionsSchema,
  type PackItem,
} from './contentPack';
import { DEFAULT_SETTINGS } from './defaultSettings';
import { GameSettingsSchema } from './settings';
import { parseTaskContent } from './taskContent';
import type { TaskKey } from './taskKeys';

let n = 0;
function item(taskKey: TaskKey, publicData: unknown, secretData: unknown = {}): PackItem {
  n += 1;
  return { id: `item-${n}`, taskKey, position: n, publicData, secretData };
}

const riddle = (i: number) =>
  item('riddle', { riddle: `Riddle ${i}?` }, { answers: [`answer ${i}`], clue: `Clue ${i}` });
const dilemma = (scenario: string) =>
  item('ethical_dilemma', { scenario, options: ['A', 'B', 'C', 'D'] });
const options = PackOptionsSchema.parse({});

describe('pack item checks', () => {
  it('says what is missing in plain words', () => {
    expect(
      checkPackItem('riddle', {
        publicData: { riddle: ' ' },
        secretData: { answers: [], clue: 'c' },
      }),
    ).toEqual([
      { path: 'public.riddle', message: 'Write the riddle.' },
      { path: 'secret.answers', message: 'Add at least one accepted answer.' },
    ]);
  });

  it('needs 4 options for a dilemma', () => {
    const errors = checkPackItem('ethical_dilemma', {
      publicData: { scenario: 'S', options: ['A', 'B', 'C'] },
      secretData: {},
    });
    expect(errors).toEqual([{ path: 'public.options', message: 'A dilemma needs 4 options.' }]);
  });

  it('counts the Spot the Difference marks still to go', () => {
    const pics = {
      leftImageUrl: 'l',
      rightImageUrl: 'r',
      width: 100,
      height: 50,
      rightWidth: 100,
      rightHeight: 50,
    };
    const areas = Array.from({ length: 5 }, (_, i) => ({ x: i * 10, y: 10, r: 5 }));
    expect(checkPackItem('spot_difference', { publicData: pics, secretData: { areas } })).toEqual([
      { path: 'secret.areas', message: 'Mark 7 differences: 5 marked, 2 to go.' },
    ]);
    const sizes = { ...pics, rightHeight: 49 };
    const seven = [...areas, areas[0]!, areas[1]!];
    expect(
      checkPackItem('spot_difference', { publicData: sizes, secretData: { areas: seven } }),
    ).toEqual([
      { path: 'public.rightImageUrl', message: 'The two pictures must be the same size.' },
    ]);
  });

  it('keeps Hangman phrases to letters', () => {
    const errors = checkPackItem('hangman', {
      publicData: { category: 'Film' },
      secretData: { phrase: 'Top Gun 2' },
    });
    expect(errors[0]?.message).toBe('Use letters, spaces, hyphens and apostrophes only.');
  });

  it('checks that every Data Story question has answers and a real chart', () => {
    const errors = checkPackItem('data_story', {
      publicData: {
        charts: [{ id: 'sales', title: 'Sales', type: 'bar', data: [{ label: 'Q1', value: 3 }] }],
        questions: ['Q one?', 'Q two?'],
      },
      secretData: { answers: [['3']], hintChartIds: ['sales', 'nope'] },
    });
    expect(errors).toEqual([
      { path: 'secret.answers', message: 'Every question needs its accepted answers.' },
      { path: 'secret.hintChartIds.1', message: 'Choose one of the charts.' },
    ]);
  });
});

describe('compileGameContent', () => {
  it('turns pool items into one row that the game accepts', () => {
    const rows = compileGameContent([riddle(1), riddle(2), riddle(3), riddle(4)], options, null);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.key).toBe('riddle');
    const parsed = parseTaskContent('riddle', row);
    expect(parsed.publicData.riddles).toEqual(['Riddle 1?', 'Riddle 2?', 'Riddle 3?', 'Riddle 4?']);
    expect(parsed.secretData.clues).toHaveLength(4);
  });

  it('leaves out items with problems', () => {
    const broken = item('riddle', { riddle: '' }, { answers: ['x'], clue: 'c' });
    const rows = compileGameContent([riddle(1), broken], options, null);
    expect(parseTaskContent('riddle', rows[0]!).publicData.riddles).toHaveLength(1);
  });

  it('gives every team the chosen dilemma, or the first one', () => {
    const a = dilemma('First');
    const b = dilemma('Second');
    expect(compileGameContent([a, b], options, b.id)[0]!.publicData).toMatchObject({
      scenario: 'Second',
    });
    expect(compileGameContent([a, b], options, 'gone')[0]!.publicData).toMatchObject({
      scenario: 'First',
    });
  });

  it('names Guess the Celebrity photos by item id, never by the person', () => {
    const face = item(
      'guess_celebrity',
      { imageUrl: 'https://blob/x.webp' },
      { names: ['MS Dhoni'] },
    );
    const [row] = compileGameContent([face], { guessCelebrityTaskName: 'Guess the Leader' }, null);
    const parsed = parseTaskContent('guess_celebrity', row!);
    expect(parsed.publicData).toEqual({
      taskName: 'Guess the Leader',
      faces: [{ id: face.id, imageUrl: 'https://blob/x.webp' }],
    });
    expect(JSON.stringify(row!.publicData)).not.toContain('Dhoni');
  });

  it('keeps variant tasks as one row per puzzle', () => {
    const vault = (d: string) =>
      item(
        'vault',
        { intro: 'Crack it', clues: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] },
        { clueDigits: [d, d, d] },
      );
    const rows = compileGameContent([vault('1'), vault('2')], options, null);
    expect(rows.map((r) => [r.key, r.variant])).toEqual([
      ['vault', 1],
      ['vault', 2],
    ]);
  });
});

describe('packReadiness', () => {
  const tasks = DEFAULT_SETTINGS.tasks;

  it('says what stops a game from starting', () => {
    const r = packReadiness([riddle(1)], tasks);
    expect(r.ready).toBe(false);
    expect(r.problems).toEqual([
      'The Vault needs content.',
      'Find the Code needs content.',
      'At least 3 of the other tasks need content (1 have it now).',
    ]);
    expect(r.warnings).toContain(
      'Riddle: 1 riddle in the pool but 3 riddles per try, so each try gets only 1.',
    );
    expect(r.tasks.find((t) => t.key === 'riddle')?.label).toBe('1 riddle');
  });
});

describe('settings for pools', () => {
  it('loads games saved before pools with the defaults', () => {
    const old = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as { tasks: Record<string, unknown> };
    delete old.tasks.poolPerTry;
    expect(GameSettingsSchema.parse(old).tasks.poolPerTry).toEqual({
      riddle: 3,
      data_story: 3,
      pictionary: 5,
    });
  });

  it('still loads a Hangman saved with one phrase', () => {
    const parsed = parseTaskContent('hangman', {
      publicData: { category: 'Film' },
      secretData: { phrase: 'Jaws' },
    });
    expect(parsed).toEqual({
      publicData: { categories: ['Film'] },
      secretData: { phrases: ['Jaws'] },
    });
  });

  it('refuses pool lists of different lengths', () => {
    expect(() =>
      parseTaskContent('riddle', {
        publicData: { riddles: ['a', 'b'] },
        secretData: { answers: [['a']], clues: ['c', 'd'] },
      }),
    ).toThrow(/different lengths/);
  });
});
