import {
  COMMON_TASKS_PER_TEAM,
  FIXED_CONTENT_TASK_KEYS,
  TASK_DEFINITIONS,
  UNIQUE_TASKS_PER_TEAM,
  distinctLetters,
  type FindCodeCipher,
  type FragmentKind,
  type TaskKey,
  type TaskSecretContent,
} from '@magic-potion/shared';
import { randInt, shuffle, type Rng } from './rng';

// Task draw and fragment chains (GAME_RULES sections 3 and 4). Pure apart from the injected RNG.

export const COMMON_TASK_KEYS: readonly TaskKey[] = TASK_DEFINITIONS.filter(
  (d) => d.type === 'COMMON',
).map((d) => d.key);
export const UNIQUE_TASK_KEYS: readonly TaskKey[] = TASK_DEFINITIONS.filter(
  (d) => d.type === 'UNIQUE',
).map((d) => d.key);

if (COMMON_TASK_KEYS.length !== COMMON_TASKS_PER_TEAM) {
  throw new Error('Task definitions must have exactly 2 common tasks');
}

// Each team gets the 2 common tasks plus 3 different unique tasks drawn at random.
// Several teams may draw the same unique task. Only tasks with content can be drawn.
export function drawTasks(rng: Rng, availableUnique: readonly TaskKey[]): TaskKey[] {
  if (availableUnique.length < UNIQUE_TASKS_PER_TEAM) {
    throw new Error(`Need content for at least ${UNIQUE_TASKS_PER_TEAM} unique tasks`);
  }
  return [...COMMON_TASK_KEYS, ...shuffle(rng, availableUnique).slice(0, UNIQUE_TASKS_PER_TEAM)];
}

// Random chain order, so the chain does not follow team names. Returns team ids by position.
export function chainOrder(rng: Rng, teamIds: readonly string[]): string[] {
  return shuffle(rng, teamIds);
}

export function chainOffset(kind: FragmentKind, teamCount: number): number {
  if (kind === 'VAULT') return 1;
  return teamCount < 3 ? 1 : 2;
}

export interface FragmentPlan {
  kind: FragmentKind;
  holderTeamId: string;
  neededByTeamId: string;
  value: string;
  // For Find the Code: the needing team's word and cipher.
  secretData: FindCodeCipher | null;
}

// The Vault fragment is 3 random digits per team, shown as "4-2-9".
export function vaultFragmentValue(rng: Rng): string {
  return Array.from({ length: 3 }, () => String(randInt(rng, 10))).join('-');
}

// The digits a Vault fragment adds to the end of the code.
export function vaultFragmentDigits(value: string): string {
  return value.replace(/\D/g, '');
}

// Which letters of a Find the Code word the team sees (GAME_RULES section 3). So the word cannot
// be guessed without the fragment: never the first letter, at most half of the different letters
// (rounded down), the ones used least often, and never more than half of the word.
// Ties are broken at random.
export function visibleLetters(rng: Rng, word: string): string[] {
  const letters = distinctLetters(word);
  const upper = word.toUpperCase();
  const count = (l: string) => [...upper].filter((c) => c === l).length;
  const first = upper[0];
  const candidates = shuffle(
    rng,
    letters.filter((l) => l !== first),
  ).sort((a, b) => count(a) - count(b));
  const shown: string[] = [];
  let shownPositions = 0;
  for (const l of candidates) {
    if (shown.length === Math.floor(letters.length / 2)) break;
    // Stop before more than half of the word would show.
    if (shownPositions + count(l) > Math.floor(upper.length / 2)) break;
    shown.push(l);
    shownPositions += count(l);
  }
  return shown;
}

// One team's Find the Code puzzle: a random symbol for each different letter of the word.
// Some letters are on screen (see visibleLetters); the rest are the fragment.
export function makeCipher(rng: Rng, word: string, symbols: readonly string[]): FindCodeCipher {
  const letters = distinctLetters(word);
  const pool = shuffle(rng, symbols);
  const symbolOf = new Map(letters.map((l, i) => [l, pool[i] as string]));
  const visible = new Set(visibleLetters(rng, word));
  const pairs = shuffle(rng, letters).map((letter) => ({
    symbol: symbolOf.get(letter) as string,
    letter,
  }));
  return {
    word: word.toUpperCase(),
    encodedMessage: [...word.toUpperCase()].map((l) => symbolOf.get(l) as string),
    visibleKey: pairs.filter((p) => visible.has(p.letter)),
    hiddenKey: pairs.filter((p) => !visible.has(p.letter)),
  };
}

// The Find the Code fragment is the hidden half of a cipher key, shown as "■ = W, ✚ = O".
export function findCodeFragmentValue(cipher: FindCodeCipher): string {
  return cipher.hiddenKey.map((k) => `${k.symbol} = ${k.letter}`).join(', ');
}

// The team at position p holds the fragment needed by the team at (p + offset) mod n.
// Each team gets its own Find the Code word (spread across the word list) and cipher.
export function buildFragments(
  rng: Rng,
  order: readonly string[],
  findCode: TaskSecretContent<'find_code'>,
): FragmentPlan[] {
  const n = order.length;
  const words = shuffle(rng, findCode.words);
  const plans: FragmentPlan[] = [];
  for (const kind of ['VAULT', 'FIND_CODE'] as const) {
    const offset = chainOffset(kind, n);
    for (let p = 0; p < n; p++) {
      const needer = (p + offset) % n;
      if (kind === 'VAULT') {
        plans.push({
          kind,
          holderTeamId: order[p] as string,
          neededByTeamId: order[needer] as string,
          value: vaultFragmentValue(rng),
          secretData: null,
        });
        continue;
      }
      const cipher = makeCipher(rng, words[needer % words.length] as string, findCode.symbols);
      plans.push({
        kind,
        holderTeamId: order[p] as string,
        neededByTeamId: order[needer] as string,
        value: findCodeFragmentValue(cipher),
        secretData: cipher,
      });
    }
  }
  return plans;
}

export interface ContentVariant {
  id: string;
  variant: number;
}

// Content for a new attempt (GAME_RULES section 3): an unused variant if there is one,
// else the same content as last time. Find the Code always keeps its first variant.
export function pickContent(
  key: TaskKey,
  variants: readonly ContentVariant[],
  usedContentIds: readonly string[],
): ContentVariant {
  const sorted = [...variants].sort((a, b) => a.variant - b.variant);
  const first = sorted[0];
  if (!first) throw new Error(`No content for task ${key}`);
  if (FIXED_CONTENT_TASK_KEYS.includes(key)) return first;
  const unused = sorted.find((v) => !usedContentIds.includes(v.id));
  if (unused) return unused;
  const lastId = usedContentIds[usedContentIds.length - 1];
  return sorted.find((v) => v.id === lastId) ?? first;
}
