import { randomInt } from 'node:crypto';

// Seedable random numbers, so tests and the simulation are repeatable.
// The live server seeds from crypto.

export interface Rng {
  // A float in [0, 1).
  next(): number;
}

// mulberry32: small, fast and good enough for shuffling teams and tasks.
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function cryptoRng(): Rng {
  return seededRng(randomInt(0, 2 ** 32 - 1));
}

// A whole number in [0, n).
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng.next() * n);
}

// A shuffled copy (Fisher-Yates).
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
