import {
  TASK_KEYS,
  TaskContentSchemas,
  TaskKeySchema,
  parseTaskContent,
} from '@magic-potion/shared';
import { describe, expect, it } from 'vitest';
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
});
