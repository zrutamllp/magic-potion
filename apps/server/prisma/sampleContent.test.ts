import {
  TASK_KEYS,
  TaskContentSchemas,
  TaskKeySchema,
  parseTaskContent,
} from '@magic-potion/shared';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { forbiddenPhrases } from '@magic-potion/shared';
import {
  SAMPLE_INBOX_ITEMS,
  SAMPLE_TASK_CONTENT,
  parseTasksArg,
  sampleContentFor,
} from './sampleContent';

describe('sample content pack', () => {
  it('has content for all 12 tasks', () => {
    expect(new Set(SAMPLE_TASK_CONTENT.map((c) => c.key))).toEqual(new Set(TASK_KEYS));
  });

  it.each(SAMPLE_TASK_CONTENT.map((c) => [`${c.key} v${c.variant}`, c] as const))(
    '%s matches its schema',
    (_, c) => {
      expect(() => parseTaskContent(TaskKeySchema.parse(c.key), c)).not.toThrow();
    },
  );

  it('has unique variant numbers per task', () => {
    const ids = SAMPLE_TASK_CONTENT.map((c) => `${c.key}:${c.variant}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps answers out of public content', () => {
    // Data Story answers are read off the public charts by design.
    for (const c of SAMPLE_TASK_CONTENT.filter((c) => c.key !== 'data_story')) {
      const schemas = TaskContentSchemas[c.key];
      const pub = JSON.stringify(schemas.public.parse(c.publicData)).toLowerCase();
      const secret = schemas.secret.parse(c.secretData) as Record<string, unknown>;
      const answers = [secret['answer'], secret['answers'], secret['words'], secret['phrase']]
        .flat(2)
        .filter((a): a is string => typeof a === 'string' && a.length > 3);
      for (const a of answers) expect(pub, `${c.key} leaks "${a}"`).not.toContain(a.toLowerCase());
    }
  });

  it('has 1 photo and 2 questions with answers', () => {
    expect(SAMPLE_INBOX_ITEMS.map((i) => i.kind).sort()).toEqual(['PHOTO', 'QUESTION', 'QUESTION']);
    for (const q of SAMPLE_INBOX_ITEMS.filter((i) => i.kind === 'QUESTION')) {
      expect(q.secretAnswer?.length).toBeGreaterThan(0);
    }
  });

  // GAME_RULES section 16: no sample text tells teams to cooperate or explains Found items.
  // Secret answers are included: players see them once solved (Find the Code's words).
  it('never tells teams to cooperate', () => {
    const strings: string[] = [];
    const collect = (v: unknown): void => {
      if (typeof v === 'string') strings.push(v);
      else if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v === 'object') Object.values(v).forEach(collect);
    };
    collect(SAMPLE_TASK_CONTENT);
    collect(SAMPLE_INBOX_ITEMS);
    const bad = strings
      .map((text) => ({ text, phrases: forbiddenPhrases(text) }))
      .filter((x) => x.phrases.length > 0);
    expect(bad).toEqual([]);
  });

  it('gives every riddle at least 2 accepted answers', () => {
    for (const c of SAMPLE_TASK_CONTENT.filter((c) => c.key === 'riddle')) {
      const { secretData } = parseTaskContent('riddle', c);
      for (const answers of secretData.answers) expect(answers.length).toBeGreaterThanOrEqual(2);
    }
  });

  // Each Hangman word is one row of tiles at 1280x720, so no word is longer than 12 letters.
  it('keeps Hangman phrases short enough for one screen', () => {
    for (const c of SAMPLE_TASK_CONTENT.filter((c) => c.key === 'hangman')) {
      for (const phrase of parseTaskContent('hangman', c).secretData.phrases) {
        expect(phrase.length).toBeLessThanOrEqual(28);
        for (const word of phrase.split(' ')) expect(word.length).toBeLessThanOrEqual(12);
      }
    }
  });

  // GAME_RULES section 3: Find the Code uses random letter codes made at game start, never words.
  it('has no Find the Code word list, only a code length', () => {
    const findCode = SAMPLE_TASK_CONTENT.find((c) => c.key === 'find_code');
    expect(findCode?.secretData).not.toHaveProperty('words');
    expect(findCode?.secretData).toMatchObject({ codeLength: { min: 6, max: 7 } });
  });

  it('--tasks keeps the common tasks and only the listed unique tasks', () => {
    const keys = parseTasksArg(['--short', '--tasks', 'riddle,hangman,ethical_dilemma']);
    expect(keys).toEqual(['riddle', 'hangman', 'ethical_dilemma']);
    expect(new Set(sampleContentFor(keys).map((c) => c.key))).toEqual(
      new Set(['vault', 'find_code', 'riddle', 'hangman', 'ethical_dilemma']),
    );
    expect(parseTasksArg(['--short'])).toEqual([]);
    expect(sampleContentFor([])).toBe(SAMPLE_TASK_CONTENT);
    expect(() => parseTasksArg(['--tasks', 'riddle,hangman'])).toThrow();
    expect(() => parseTasksArg(['--tasks', 'riddle,hangman,nope'])).toThrow();
  });

  // Sample images are served by the web app from apps/web/public. Tasks with built screens
  // only: Batch 4 media arrives with its screens.
  it('has every sample image file it points to', () => {
    const publicDir = fileURLToPath(new URL('../../web/public', import.meta.url));
    const built = SAMPLE_TASK_CONTENT.filter((c) =>
      ['picture_puzzle', 'spot_difference'].includes(c.key),
    );
    const urls = JSON.stringify(built).match(/"\/sample\/[^"]+"/g) ?? [];
    expect(urls.length).toBeGreaterThanOrEqual(3);
    for (const u of urls) expect(existsSync(publicDir + JSON.parse(u)), u).toBe(true);
  });

  it('keeps every Spot the Difference area inside the picture', () => {
    for (const c of SAMPLE_TASK_CONTENT.filter((c) => c.key === 'spot_difference')) {
      const { publicData, secretData } = parseTaskContent('spot_difference', c);
      for (const a of secretData.areas) {
        expect(a.x - a.r).toBeGreaterThanOrEqual(0);
        expect(a.y - a.r).toBeGreaterThanOrEqual(0);
        expect(a.x + a.r).toBeLessThanOrEqual(publicData.width);
        expect(a.y + a.r).toBeLessThanOrEqual(publicData.height);
      }
    }
  });

  // Each answer is worked out again from the chart data, so the numbers and answers cannot drift.
  it('Data Story answers match their charts', () => {
    const stories = SAMPLE_TASK_CONTENT.filter((c) => c.key === 'data_story').map((c) =>
      parseTaskContent('data_story', c),
    );
    const chart = (i: number, id: string) => {
      const found = stories[i]!.publicData.charts.find((c) => c.id === id);
      if (!found) throw new Error(`missing chart ${id}`);
      return found.data;
    };
    const top = (d: { label: string; value: number }[]) =>
      d.reduce((a, b) => (b.value > a.value ? b : a)).label;
    const bottom = (d: { label: string; value: number }[]) =>
      d.reduce((a, b) => (b.value < a.value ? b : a)).label;
    const value = (d: { label: string; value: number }[], label: string) =>
      d.find((x) => x.label === label)!.value;

    const [one, two] = stories;
    // Variant 1
    expect(one!.secretData.answers[0]).toContain(top(chart(0, 'sales')));
    const orders = chart(0, 'orders');
    const drops = orders.filter((d, i) => i > 0 && d.value < orders[i - 1]!.value);
    expect(drops.map((d) => d.label)).toEqual(['Jun']);
    expect(one!.secretData.answers[1]).toContain('Jun');
    const complaints = chart(0, 'complaints');
    expect(one!.secretData.answers[2]).toContain(
      String(value(complaints, 'Late delivery') - value(complaints, 'Damaged item')),
    );
    // Variant 2
    expect(two!.secretData.answers[0]).toContain(bottom(chart(1, 'packed')));
    expect(two!.secretData.answers[1]).toContain(
      String(chart(1, 'returns').reduce((sum, d) => sum + d.value, 0)),
    );
    const dispatch = chart(1, 'dispatch');
    expect(two!.secretData.answers[2]).toContain(
      String(value(dispatch, 'Week 35') - value(dispatch, 'Week 38')),
    );
    // Every hint points at a chart that exists.
    for (const s of stories) {
      for (const id of s.secretData.hintChartIds) {
        expect(s.publicData.charts.map((c) => c.id)).toContain(id);
      }
    }
  });
});
