import { TASK_DEFINITIONS, TASK_KEYS, type TaskKey } from '@magic-potion/shared';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../engine/clock';
import type { GameEngine } from '../engine/engine';
import { memoryEngine } from '../engine/memoryGame';
import { wrongSubmission } from '../engine/solver';
import type { GameContent } from '../engine/state';
import { buildFeed, buildPlayerState, buildStaffState } from './views';

// "Answers never reach the browser" (CLAUDE.md principle 2), checked for all 12 tasks at once
// (Phase 7A). Each task is played the way a team plays it before solving: start, wrong tries,
// give up, restart, then the hint. Everything the team would be sent (its state, its feed and
// the answer to each action) is recorded and searched for every secret:
//   - answers from the task content (all variants), which must never appear;
//   - hint material, which may appear only after the hint is bought;
//   - other teams' fragments and the team's own code, and inbox answers.

const MIN = 60_000;
const T0 = Date.UTC(2026, 8, 30, 9, 0, 0);
const UNIQUE = TASK_DEFINITIONS.filter((t) => t.type === 'UNIQUE').map((t) => t.key);

type Secrets = { answers: string[]; hintMaterial: string[] };

const strings = (v: unknown): string[] =>
  typeof v === 'string'
    ? [v]
    : Array.isArray(v)
      ? v.flatMap(strings)
      : v && typeof v === 'object'
        ? Object.values(v).flatMap(strings)
        : [];

// Worth searching for: at least 3 characters and not only digits and spaces (numbers such as
// 150 or 1650 also appear in timers and chart data, so they are checked by key instead).
const searchable = (list: string[]) =>
  [...new Set(list.map((s) => s.trim().toLowerCase()))].filter(
    (s) => s.length >= 3 && !/^[\d\s.,-]+$/.test(s),
  );

// The secret fields of each task's content: true answers, and hint material.
function contentSecrets(key: TaskKey, secret: Record<string, unknown>): Secrets {
  switch (key) {
    case 'hangman':
      return { answers: strings(secret.phrases), hintMaterial: [] };
    case 'alien_translator':
      return { answers: strings(secret.answer), hintMaterial: [] };
    case 'guess_celebrity':
      return { answers: strings(secret.names), hintMaterial: [] };
    case 'pictionary':
      return { answers: strings(secret.words), hintMaterial: [] };
    case 'escape_room': {
      const stages = (secret.stages ?? []) as { answer: unknown; hint: unknown }[];
      return {
        answers: stages.flatMap((s) => strings(s.answer)),
        hintMaterial: stages.flatMap((s) => strings(s.hint)),
      };
    }
    case 'riddle':
      return { answers: strings(secret.answers), hintMaterial: strings(secret.clues) };
    case 'data_story':
      return { answers: strings(secret.answers), hintMaterial: [] };
    default:
      // The Vault, Find the Code: per team (below). Picture Puzzle, Spot the Difference,
      // Ethical Dilemma: nothing text-like to search for (Spot the Difference is checked by key).
      return { answers: [], hintMaterial: [] };
  }
}

// A game where every team draws this task (only it and two others have unique content).
async function gameWith(key: TaskKey) {
  const clock = new FakeClock(T0);
  const { engine } = memoryEngine({ teams: 4, clock, seed: 5 });
  const content = engine.gameContent as GameContent;
  const others = UNIQUE.filter((k) => k !== key).slice(
    0,
    key === 'vault' || key === 'find_code' ? 3 : 2,
  );
  const keep = new Set<TaskKey>([
    'vault',
    'find_code',
    ...(UNIQUE.includes(key) ? [key] : []),
    ...others,
  ]);
  for (const k of TASK_KEYS) if (!keep.has(k)) delete content.byKey[k];
  await engine.startGame('admin-1');
  // The inbox bonus questions are out too.
  clock.set(T0 + 11 * MIN);
  await engine.tick();
  return { engine, clock };
}

function secretsFor(engine: GameEngine, key: TaskKey, teamId: string): Secrets {
  const s = engine.state;
  const variants = engine.gameContent.byKey[key] ?? [];
  const fromContent = variants.map((c) =>
    contentSecrets(key, c.secretData as Record<string, unknown>),
  );
  const answers = fromContent.flatMap((x) => x.answers);
  // Fragments this team does not hold (its own held fragments are its Found items).
  for (const f of Object.values(s.fragments)) {
    if (f.holderTeamId !== teamId) answers.push(f.value);
    // This team's own Find the Code word.
    if (f.neededByTeamId === teamId && f.secretData && typeof f.secretData === 'object') {
      answers.push(...strings((f.secretData as { word?: unknown }).word));
    }
  }
  for (const item of Object.values(s.inboxItems)) answers.push(...strings(item.secretAnswer));
  return {
    answers: searchable(answers),
    hintMaterial: searchable(fromContent.flatMap((x) => x.hintMaterial)),
  };
}

// The public content a team may see before solving anything. The Escape Room sends each stage
// only after the one before is solved, so only the intro and stage 1 count here: a later stage's
// text (which can give away an earlier answer) must not arrive early.
function visibleBeforeSolving(key: TaskKey, publicData: unknown): unknown {
  if (key !== 'escape_room') return publicData;
  const p = publicData as { intro: string; stages: unknown[] };
  return { intro: p.intro, stage: p.stages[0] };
}

// Whole words only, in text values only (not JSON field names): "age" is not in "message",
// and a task's "key" field is not the answer "key".
function hasWord(texts: string[], secret: string): boolean {
  const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u');
  return texts.some((t) => re.test(t));
}

// Secrets found in what the team was sent. An answer that is itself part of the task's public
// content (a Data Story answer that is a chart label, a choice named in a prompt) is public by
// design, so it does not count.
function leaked(payloads: unknown[], secrets: string[], publicText: string[]): string[] {
  const texts = payloads.flatMap(strings).map((t) => t.toLowerCase());
  return secrets.filter((s) => !hasWord(publicText, s) && hasWord(texts, s));
}

describe.each(TASK_KEYS)('answers never reach the browser: %s', (key) => {
  it('before solving, and after the hint', async () => {
    const { engine, clock } = await gameWith(key);
    const teamId = 'team-1';
    const task = Object.values(engine.state.teams[teamId]!.tasks).find((t) => t.key === key);
    if (!task) throw new Error(`team-1 did not draw ${key}`);
    const payloads: unknown[] = [];
    const sent = (value: unknown) => payloads.push(value);
    const publicText = (engine.gameContent.byKey[key] ?? []).flatMap((c) =>
      strings(visibleBeforeSolving(key, c.publicData)).map((t) => t.toLowerCase()),
    );
    const snapshot = () => {
      sent(buildPlayerState(engine, teamId, clock.now()));
      sent(buildFeed(engine.state, { kind: 'team', teamId }));
    };
    const tryWrong = async (times: number) => {
      for (let i = 0; i < times; i++) {
        const wrong = wrongSubmission(engine.state, engine.gameContent, teamId, task.id);
        if (wrong === null) return;
        sent(await engine.submit(teamId, task.id, wrong));
        snapshot();
      }
    };

    snapshot();
    sent(await engine.startTask(teamId, task.id));
    snapshot();
    await tryWrong(2);
    sent(await engine.giveUp(teamId, task.id));
    snapshot();
    clock.advance(MIN);
    // A restart plays a new content variant where there is one.
    sent(await engine.startTask(teamId, task.id));
    snapshot();
    await tryWrong(1);

    const secrets = secretsFor(engine, key, teamId);
    expect(leaked(payloads, secrets.answers, publicText), 'answers before the hint').toEqual([]);
    expect(leaked(payloads, secrets.hintMaterial, publicText), 'hint text before the hint').toEqual(
      [],
    );
    if (key === 'spot_difference') {
      expect(JSON.stringify(payloads)).not.toMatch(/"areas"|"r":/);
    }

    // The hint shows hint material, never an answer.
    sent(await engine.useHint(teamId, task.id));
    snapshot();
    await tryWrong(1);
    expect(leaked(payloads, secrets.answers, publicText), 'answers after the hint').toEqual([]);
  });
});

describe('the leak check itself', () => {
  it('finds a planted answer, and ignores field names and parts of longer words', () => {
    const sent = [{ view: { note: 'The code word is South wind.' } }, { message: 'page' }];
    expect(leaked(sent, ['south wind', 'age', 'view'], [])).toEqual(['south wind']);
    // An answer that is part of the public content does not count.
    expect(leaked(sent, ['south wind'], ['wind from the south wind'])).toEqual([]);
  });
});

describe('staff payloads', () => {
  it('never give a co-facilitator the answers or any fragment value', async () => {
    const { engine, clock } = await gameWith('riddle');
    const cofac = {
      id: 'cofac-1',
      name: 'Co-facilitator',
      email: 'c@x',
      role: 'CO_FACILITATOR' as const,
      active: true,
      passwordHash: '',
    };
    // Even with dev tools on, fragment values are only for the main admin.
    const state = buildStaffState(
      engine,
      cofac,
      new Set(['team-1']),
      () => true,
      true,
      clock.now(),
    );
    const values = strings(state).map((t) => t.toLowerCase());
    for (const f of Object.values(engine.state.fragments)) {
      expect(hasWord(values, f.value.toLowerCase()), f.value).toBe(false);
    }
    for (const c of engine.gameContent.byKey.riddle ?? []) {
      for (const answer of searchable(strings((c.secretData as { answers: unknown }).answers))) {
        expect(hasWord(values, answer), answer).toBe(false);
      }
    }
  });
});
