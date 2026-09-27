import {
  TASK_KEYS,
  TaskContentSchemas,
  TaskKeySchema,
  parseTaskContent,
} from '@magic-potion/shared';
import { describe, expect, it } from 'vitest';
import englishWords from 'an-array-of-english-words';
import { forbiddenPhrases } from '@magic-potion/shared';
import { visibleLetters } from '../src/engine/assignment';
import { seededRng } from '../src/engine/rng';
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

  // GAME_RULES section 3: Find the Code cannot be guessed from the team's own half of the key.
  // For every pattern a team can see, count the English words that fit it.
  describe('Find the Code words cannot be guessed without the fragment', () => {
    const MIN_FITTING_WORDS = 15;
    const findCode = SAMPLE_TASK_CONTENT.find((c) => c.key === 'find_code');
    const words = (findCode?.secretData as { words: string[] }).words;
    const byLength = new Map<number, string[]>();
    for (const w of englishWords as string[]) {
      if (/^[a-z]+$/.test(w)) byLength.set(w.length, [...(byLength.get(w.length) ?? []), w]);
    }

    // English words that fit what the team sees: shown letters in place, and each hidden symbol
    // one letter that is not shown, different symbols different letters.
    function fitting(word: string, shown: Set<string>): string[] {
      const w = word.toLowerCase();
      return (byLength.get(w.length) ?? []).filter((candidate) => {
        const map = new Map<string, string>();
        const used = new Set<string>();
        for (let i = 0; i < w.length; i++) {
          const real = w[i] as string;
          const letter = candidate[i] as string;
          if (shown.has(real)) {
            if (letter !== real) return false;
          } else if (shown.has(letter)) {
            return false;
          } else if (map.has(real)) {
            if (map.get(real) !== letter) return false;
          } else {
            if (used.has(letter)) return false;
            map.set(real, letter);
            used.add(letter);
          }
        }
        return true;
      });
    }

    for (const word of words) {
      it(word, () => {
        const patterns = new Set<string>();
        for (let seed = 1; seed <= 60; seed++) {
          patterns.add(visibleLetters(seededRng(seed), word).sort().join(''));
        }
        for (const pattern of patterns) {
          const shown = new Set([...pattern.toLowerCase()]);
          expect(shown.has(word[0] as string)).toBe(false);
          expect(fitting(word, shown).length).toBeGreaterThanOrEqual(MIN_FITTING_WORDS);
        }
      });
    }
  });
});
