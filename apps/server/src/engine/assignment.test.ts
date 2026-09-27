import { describe, expect, it } from 'vitest';
import {
  UNIQUE_TASK_KEYS,
  buildFragments,
  chainOrder,
  drawTasks,
  makeCipher,
  pickContent,
  vaultFragmentDigits,
} from './assignment';
import { seededRng } from './rng';

const findCodeSecret = {
  words: ['teamwork', 'together', 'trust'],
  symbols: ['★', '◆', '●', '▲', '■', '✚', '☾', '✿', '♣', '♠'],
};

describe('drawTasks', () => {
  it('gives 2 common tasks and 3 different unique tasks', () => {
    const rng = seededRng(3);
    for (let i = 0; i < 50; i++) {
      const tasks = drawTasks(rng, UNIQUE_TASK_KEYS);
      expect(tasks).toHaveLength(5);
      expect(tasks.slice(0, 2)).toEqual(['vault', 'find_code']);
      const unique = tasks.slice(2);
      expect(new Set(unique).size).toBe(3);
      for (const k of unique) expect(UNIQUE_TASK_KEYS).toContain(k);
    }
  });

  it('draws every unique task sometimes', () => {
    const rng = seededRng(9);
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) for (const k of drawTasks(rng, UNIQUE_TASK_KEYS)) seen.add(k);
    expect(seen.size).toBe(12);
  });

  it('draws only from tasks that have content', () => {
    const tasks = drawTasks(seededRng(1), ['riddle', 'hangman', 'data_story']);
    expect(new Set(tasks.slice(2))).toEqual(new Set(['riddle', 'hangman', 'data_story']));
  });

  it('refuses when fewer than 3 unique tasks have content', () => {
    expect(() => drawTasks(seededRng(1), ['riddle', 'hangman'])).toThrow();
  });
});

describe('fragment chains', () => {
  const teams = Array.from({ length: 20 }, (_, i) => `t${i}`);

  it('shuffles the chain order', () => {
    const order = chainOrder(seededRng(5), teams);
    expect([...order].sort()).toEqual([...teams].sort());
    expect(order).not.toEqual(teams);
  });

  it('links Vault p to p+1 and Find the Code p to p+2', () => {
    const order = chainOrder(seededRng(5), teams);
    const plans = buildFragments(seededRng(6), order, findCodeSecret);
    const n = order.length;
    for (let p = 0; p < n; p++) {
      const vault = plans.find((f) => f.kind === 'VAULT' && f.holderTeamId === order[p]);
      const code = plans.find((f) => f.kind === 'FIND_CODE' && f.holderTeamId === order[p]);
      expect(vault?.neededByTeamId).toBe(order[(p + 1) % n]);
      expect(code?.neededByTeamId).toBe(order[(p + 2) % n]);
    }
  });

  it('gives every team exactly one fragment of each kind to hold and to need, never its own', () => {
    for (const n of [3, 4, 10, 25]) {
      const order = teams.concat(teams.map((t) => `${t}b`)).slice(0, n);
      const plans = buildFragments(seededRng(n), order, findCodeSecret);
      for (const kind of ['VAULT', 'FIND_CODE'] as const) {
        const ofKind = plans.filter((f) => f.kind === kind);
        expect(new Set(ofKind.map((f) => f.holderTeamId)).size).toBe(n);
        expect(new Set(ofKind.map((f) => f.neededByTeamId)).size).toBe(n);
        for (const f of ofKind) expect(f.holderTeamId).not.toBe(f.neededByTeamId);
      }
    }
  });

  it('uses offset 1 for Find the Code with fewer than 3 teams', () => {
    const plans = buildFragments(seededRng(1), ['a', 'b'], findCodeSecret);
    const code = plans.filter((f) => f.kind === 'FIND_CODE');
    expect(code.map((f) => [f.holderTeamId, f.neededByTeamId])).toEqual([
      ['a', 'b'],
      ['b', 'a'],
    ]);
  });

  it('makes Vault fragments of 3 digits', () => {
    const plans = buildFragments(seededRng(2), ['a', 'b', 'c'], findCodeSecret);
    for (const f of plans.filter((p) => p.kind === 'VAULT')) {
      expect(f.value).toMatch(/^\d-\d-\d$/);
      expect(vaultFragmentDigits(f.value)).toHaveLength(3);
      expect(f.secretData).toBeNull();
    }
  });

  it('gives each team its own Find the Code word and cipher, with the hidden key as the fragment', () => {
    const plans = buildFragments(seededRng(2), ['a', 'b', 'c'], findCodeSecret);
    const code = plans.filter((p) => p.kind === 'FIND_CODE');
    expect(new Set(code.map((f) => f.secretData?.word)).size).toBe(3);
    for (const f of code) {
      const hidden = f.secretData?.hiddenKey.map((k) => `${k.symbol} = ${k.letter}`).join(', ');
      expect(f.value).toBe(hidden);
    }
    // A team's own fragment never solves its own puzzle.
    const neededBy = new Map(code.map((f) => [f.neededByTeamId, f.value]));
    for (const f of code) expect(neededBy.get(f.holderTeamId)).not.toBe(f.value);
  });
});

describe('makeCipher', () => {
  const symbols = findCodeSecret.symbols;

  it('encodes the word with one symbol per different letter', () => {
    const c = makeCipher(seededRng(4), 'teamwork', symbols);
    expect(c.word).toBe('TEAMWORK');
    expect(c.encodedMessage).toHaveLength(8);
    const key = new Map([...c.visibleKey, ...c.hiddenKey].map((k) => [k.symbol, k.letter]));
    expect(c.encodedMessage.map((s) => key.get(s)).join('')).toBe('TEAMWORK');
    expect(new Set(key.keys()).size).toBe(8);
  });

  it('shows half the key (rounded up) and hides the rest', () => {
    const c = makeCipher(seededRng(4), 'unity', symbols); // 5 different letters
    expect(c.visibleKey).toHaveLength(3);
    expect(c.hiddenKey).toHaveLength(2);
  });

  it('cannot be decoded from the visible half alone', () => {
    const c = makeCipher(seededRng(4), 'trust', symbols);
    const visible = new Set(c.visibleKey.map((k) => k.symbol));
    expect(c.encodedMessage.some((s) => !visible.has(s))).toBe(true);
  });

  it('uses different symbols for different teams', () => {
    const a = makeCipher(seededRng(1), 'teamwork', symbols);
    const b = makeCipher(seededRng(2), 'teamwork', symbols);
    expect(a.encodedMessage).not.toEqual(b.encodedMessage);
  });
});

describe('pickContent', () => {
  const variants = [
    { id: 'v2', variant: 2 },
    { id: 'v1', variant: 1 },
    { id: 'v3', variant: 3 },
  ];

  it('starts with the first variant', () => {
    expect(pickContent('riddle', variants, []).id).toBe('v1');
  });

  it('uses an unused variant on restart', () => {
    expect(pickContent('riddle', variants, ['v1']).id).toBe('v2');
    expect(pickContent('vault', variants, ['v1', 'v2']).id).toBe('v3');
  });

  it('reuses the last content when every variant has been used', () => {
    expect(pickContent('riddle', variants, ['v1', 'v2', 'v3']).id).toBe('v3');
    expect(pickContent('riddle', [{ id: 'v1', variant: 1 }], ['v1']).id).toBe('v1');
  });

  it('always keeps the first variant for Find the Code', () => {
    expect(pickContent('find_code', variants, ['v1']).id).toBe('v1');
    expect(pickContent('find_code', variants, ['v1', 'v1']).id).toBe('v1');
  });
});
