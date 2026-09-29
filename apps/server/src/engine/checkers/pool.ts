import { shuffle, type Rng } from '../rng';
import type { Json } from './types';

// Pool tasks (Phase 6B): the content holds a pool (12 riddles, 8 phrases...) and each try draws a
// fresh set into its progress as `order` (positions in the pool). Same idea as the Guess the
// Celebrity photo draw. Entries the team has not seen in earlier tries come first.

// The pool positions a try plays. Progress saved before pools has no order: it plays the whole
// content in order, as it always did.
export function poolOrder(progress: unknown, size: number): number[] {
  const order = (progress as { order?: unknown } | null)?.order;
  if (Array.isArray(order) && order.every((i) => Number.isInteger(i))) return order as number[];
  return Array.from({ length: size }, (_, i) => i);
}

// Draws `count` positions from a pool of `size`: unseen first (in random order), then seen ones.
export function drawPool(
  rng: Rng,
  size: number,
  count: number,
  previous: readonly Json[],
): number[] {
  const seen = new Set(previous.flatMap((p) => poolOrder(p, 0)));
  const all = Array.from({ length: size }, (_, i) => i);
  const fresh = shuffle(
    rng,
    all.filter((i) => !seen.has(i)),
  );
  const again = shuffle(
    rng,
    all.filter((i) => seen.has(i)),
  );
  return [...fresh, ...again].slice(0, Math.min(count, size));
}
