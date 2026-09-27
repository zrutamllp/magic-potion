import { describe, expect, it } from 'vitest';
import { randInt, seededRng, shuffle } from './rng';

describe('seededRng', () => {
  it('repeats the same numbers for the same seed', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('gives whole numbers in range', () => {
    const rng = seededRng(1);
    for (let i = 0; i < 200; i++) {
      const n = randInt(rng, 7);
      expect(Number.isInteger(n) && n >= 0 && n < 7).toBe(true);
    }
  });

  it('shuffles without losing or adding items', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const out = shuffle(seededRng(7), items);
    expect([...out].sort((x, y) => x - y)).toEqual(items);
    expect(out).not.toEqual(items);
  });
});
