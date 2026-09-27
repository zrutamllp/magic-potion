import {
  COMMON_TASKS_PER_TEAM,
  FIXED_CONTENT_TASK_KEYS,
  TASK_DEFINITIONS,
  UNIQUE_TASKS_PER_TEAM,
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
}

// The Vault fragment is 3 random digits per team, shown as "4-2-9".
export function vaultFragmentValue(rng: Rng): string {
  return Array.from({ length: 3 }, () => String(randInt(rng, 10))).join('-');
}

// The Find the Code fragment is the hidden half of the cipher key, shown as "■ = W, ✚ = O".
export function findCodeFragmentValue(secret: TaskSecretContent<'find_code'>): string {
  return secret.hiddenKey.map((k) => `${k.symbol} = ${k.letter}`).join(', ');
}

// The digits a Vault fragment adds to the end of the code.
export function vaultFragmentDigits(value: string): string {
  return value.replace(/\D/g, '');
}

// The team at position p holds the fragment needed by the team at (p + offset) mod n.
export function buildFragments(
  rng: Rng,
  order: readonly string[],
  findCodeSecret: TaskSecretContent<'find_code'>,
): FragmentPlan[] {
  const n = order.length;
  const plans: FragmentPlan[] = [];
  for (const kind of ['VAULT', 'FIND_CODE'] as const) {
    const offset = chainOffset(kind, n);
    for (let p = 0; p < n; p++) {
      plans.push({
        kind,
        holderTeamId: order[p] as string,
        neededByTeamId: order[(p + offset) % n] as string,
        value: kind === 'VAULT' ? vaultFragmentValue(rng) : findCodeFragmentValue(findCodeSecret),
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
