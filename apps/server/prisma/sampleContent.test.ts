import {
  TASK_KEYS,
  TaskContentSchemas,
  TaskKeySchema,
  parseTaskContent,
} from '@magic-potion/shared';
import { describe, expect, it } from 'vitest';
import { forbiddenPhrases } from '@magic-potion/shared';
import { SAMPLE_INBOX_ITEMS, SAMPLE_TASK_CONTENT } from './sampleContent';

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
      const { phrase } = parseTaskContent('hangman', c).secretData;
      expect(phrase.length).toBeLessThanOrEqual(28);
      for (const word of phrase.split(' ')) expect(word.length).toBeLessThanOrEqual(12);
    }
  });

  // GAME_RULES section 3: Find the Code uses random letter codes made at game start, never words.
  it('has no Find the Code word list, only a code length', () => {
    const findCode = SAMPLE_TASK_CONTENT.find((c) => c.key === 'find_code');
    expect(findCode?.secretData).not.toHaveProperty('words');
    expect(findCode?.secretData).toMatchObject({ codeLength: { min: 6, max: 7 } });
  });
});
