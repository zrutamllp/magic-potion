import {
  DEFAULT_SETTINGS,
  TASK_KEYS,
  TaskKeySchema,
  parseTaskContent,
  type TaskKey,
} from '@magic-potion/shared';
import { describe, expect, it } from 'vitest';
import { SAMPLE_TASK_CONTENT } from '../../../prisma/sampleContent';
import { makeCipher } from '../assignment';
import { seededRng } from '../rng';
import { nameHint, type CelebrityProgress } from './guessCelebrity';
import {
  applyHint,
  checkSubmission,
  initProgress,
  publicView,
  type CheckerContext,
  type Json,
  type SubmitResult,
} from './index';

const SYMBOLS = ['★', '◆', '●', '▲', '■', '✚', '☾', '✿', '♣', '♠'];

function ctxFor(key: TaskKey, fragment: string | null = null): CheckerContext<TaskKey> {
  const sample = SAMPLE_TASK_CONTENT.find((c) => c.key === key && c.variant === 1);
  if (!sample) throw new Error(`No sample for ${key}`);
  return {
    ...parseTaskContent(TaskKeySchema.parse(key), sample),
    fragment,
    cipher: key === 'find_code' ? makeCipher(seededRng(3), 'teamwork', SYMBOLS) : null,
    tasks: DEFAULT_SETTINGS.tasks,
    rng: seededRng(1),
  } as CheckerContext<TaskKey>;
}

// Plays a list of submissions and returns every result.
function play(key: TaskKey, ctx: CheckerContext<TaskKey>, submissions: unknown[]) {
  let progress = initProgress(key, ctx);
  const results: SubmitResult<Json>[] = [];
  for (const s of submissions) {
    const r = checkSubmission(key, ctx, progress, s);
    results.push(r);
    if (r.status !== 'invalid') progress = r.progress;
  }
  return { results, progress, statuses: results.map((r) => r.status) };
}

describe('The Vault', () => {
  const ctx = ctxFor('vault', '4-2-9');

  it('is solved by the 3 clue digits followed by the fragment', () => {
    expect(play('vault', ctx, [{ code: '836429' }]).statuses).toEqual(['solved']);
    expect(play('vault', ctx, [{ code: '836-429' }]).statuses).toEqual(['solved']);
  });

  it('rejects a wrong code and ignores a code that is not 6 digits', () => {
    expect(play('vault', ctx, [{ code: '836428' }, { code: '8364' }, 'x']).statuses).toEqual([
      'wrong',
      'invalid',
      'invalid',
    ]);
  });

  it('cannot be solved without the right fragment', () => {
    expect(play('vault', ctxFor('vault', '1-1-1'), [{ code: '836429' }]).statuses).toEqual([
      'wrong',
    ]);
  });

  it('reveals one of the 3 on-screen digits as the hint', () => {
    const progress = applyHint('vault', ctx, initProgress('vault', ctx)) as {
      hint: { position: number; digit: string };
    };
    expect(['8', '3', '6'][progress.hint.position]).toBe(progress.hint.digit);
  });
});

describe('Find the Code', () => {
  const ctx = ctxFor('find_code');

  it('checks the decoded word after trimming, lowercasing and collapsing spaces', () => {
    expect(play('find_code', ctx, [{ answer: '  TeamWork ' }]).statuses).toEqual(['solved']);
    expect(play('find_code', ctx, [{ answer: 'team work' }]).statuses).toEqual(['wrong']);
    expect(play('find_code', ctx, [{ answer: '   ' }]).statuses).toEqual(['invalid']);
  });

  it('reveals one more letter of the hidden key', () => {
    const p = applyHint('find_code', ctx, initProgress('find_code', ctx)) as {
      hint: { symbol: string; letter: string };
    };
    expect(ctx.cipher?.hiddenKey).toContainEqual(p.hint);
  });

  it('shows the team its encoded message and the visible half of its key only', () => {
    const view = publicView('find_code', ctx, initProgress('find_code', ctx)) as {
      encodedMessage: string[];
      visibleKey: unknown[];
    };
    expect(view.encodedMessage).toEqual(ctx.cipher?.encodedMessage);
    expect(view.visibleKey).toEqual(ctx.cipher?.visibleKey);
    const json = JSON.stringify(view);
    expect(json).not.toContain('TEAMWORK');
    for (const k of ctx.cipher?.hiddenKey ?? []) {
      expect(json).not.toContain(JSON.stringify(k));
    }
  });

  it('cannot be checked without the team cipher', () => {
    expect(play('find_code', { ...ctx, cipher: null }, [{ answer: 'teamwork' }]).statuses).toEqual([
      'invalid',
    ]);
  });
});

describe('Picture Puzzle', () => {
  const ctx = ctxFor('picture_puzzle');
  const solved = Array.from({ length: 9 }, (_, i) => i);

  // The swaps that put every tile in place, from the given order.
  function solvingSwaps(start: number[]) {
    const order = [...start];
    const swaps: { swap: [number, number] }[] = [];
    for (let i = 0; i < order.length; i++) {
      if (order[i] === i) continue;
      const j = order.indexOf(i);
      [order[i], order[j]] = [order[j]!, order[i]!];
      swaps.push({ swap: [i, j] });
    }
    return swaps;
  }

  it('starts scrambled on the grid from the settings (3x3 by default)', () => {
    const start = initProgress('picture_puzzle', ctx) as { order: number[] };
    expect(start.order).not.toEqual(solved);
    expect([...start.order].sort((a, b) => a - b)).toEqual(solved);
    const view = publicView('picture_puzzle', ctx, start) as { rows: number; cols: number };
    expect(view).toMatchObject({ rows: 3, cols: 3 });
  });

  it('uses other grid sizes from the settings', () => {
    for (const grid of [
      { rows: 2, cols: 2 },
      { rows: 4, cols: 5 },
    ]) {
      const c = { ...ctx, tasks: { ...ctx.tasks, picturePuzzleGrid: grid } };
      const start = initProgress('picture_puzzle', c) as { order: number[] };
      expect(start.order).toHaveLength(grid.rows * grid.cols);
      expect(publicView('picture_puzzle', c, start)).toMatchObject(grid);
    }
  });

  it('swaps two tiles at a time, saving each swap, and is solved when all are in place', () => {
    const start = initProgress('picture_puzzle', ctx) as { order: number[] };
    const swaps = solvingSwaps(start.order);
    let progress: Json = start;
    const statuses: string[] = [];
    for (const s of swaps) {
      const r = checkSubmission('picture_puzzle', ctx, progress, s);
      statuses.push(r.status);
      if (r.status !== 'invalid') progress = r.progress;
    }
    expect(statuses.at(-1)).toBe('solved');
    expect(statuses.slice(0, -1).every((s) => s === 'correct')).toBe(true);
    expect((progress as { order: number[] }).order).toEqual(solved);
  });

  it('never calls a swap wrong, and ignores a bad swap', () => {
    const start = initProgress('picture_puzzle', ctx);
    for (const bad of [{ swap: [0, 0] }, { swap: [0, 9] }, { swap: [-1, 2] }, { order: solved }]) {
      expect(checkSubmission('picture_puzzle', ctx, start, bad).status).toBe('invalid');
    }
  });

  it('after the hint, marks the tiles in their right spot, and keeps up with every swap', () => {
    // Tiles 0 and 1 swapped, 2 and 3 swapped, the rest in place.
    const start = { order: [1, 0, 3, 2, 4, 5, 6, 7, 8], hint: false };
    expect(publicView('picture_puzzle', ctx, start)).toMatchObject({ inPlace: null });
    const hinted = applyHint('picture_puzzle', ctx, start);
    expect(publicView('picture_puzzle', ctx, hinted)).toMatchObject({
      inPlace: [4, 5, 6, 7, 8],
    });
    // Fix tiles 0 and 1: both spots get a mark.
    const fixed = checkSubmission('picture_puzzle', ctx, hinted, { swap: [0, 1] });
    if (fixed.status === 'invalid') throw new Error('unexpected');
    expect(publicView('picture_puzzle', ctx, fixed.progress)).toMatchObject({
      inPlace: [0, 1, 4, 5, 6, 7, 8],
    });
    // Move a right tile away: its mark goes.
    const moved = checkSubmission('picture_puzzle', ctx, fixed.progress, { swap: [4, 5] });
    if (moved.status === 'invalid') throw new Error('unexpected');
    expect(publicView('picture_puzzle', ctx, moved.progress)).toMatchObject({
      inPlace: [0, 1, 6, 7, 8],
    });
  });

  it('never says where a wrong tile belongs', () => {
    const hinted = applyHint('picture_puzzle', ctx, {
      order: [1, 0, 2, 3, 4, 5, 6, 7, 8],
      hint: false,
    });
    const view = publicView('picture_puzzle', ctx, hinted) as Record<string, unknown>;
    expect(Object.keys(view).sort()).toEqual(['cols', 'content', 'inPlace', 'order', 'rows']);
  });
});

describe('Hangman', () => {
  const ctx = ctxFor('hangman'); // "Printer out of paper"

  it('reveals matching letters and is solved when every letter is found', () => {
    const letters = [...new Set('printeroutofpaper')];
    const r = play(
      'hangman',
      ctx,
      letters.map((letter) => ({ letter })),
    );
    expect(r.statuses.at(-1)).toBe('solved');
    expect(r.statuses.slice(0, -1).every((s) => s === 'correct')).toBe(true);
  });

  it('shows only guessed letters', () => {
    const r = play('hangman', ctx, [{ letter: 'E' }, { letter: 'P' }]);
    const view = publicView('hangman', ctx, r.progress) as { masked: string };
    expect(view.masked).toBe('P____e_ ___ __ p_pe_');
  });

  it('fails after 6 wrong letters', () => {
    const r = play(
      'hangman',
      ctx,
      ['b', 'c', 'd', 'g', 'h', 'j'].map((letter) => ({ letter })),
    );
    expect(r.statuses).toEqual(['wrong', 'wrong', 'wrong', 'wrong', 'wrong', 'failed']);
  });

  it('ignores a letter guessed twice or a non-letter', () => {
    expect(
      play('hangman', ctx, [{ letter: 'b' }, { letter: 'B' }, { letter: '1' }]).statuses,
    ).toEqual(['wrong', 'invalid', 'invalid']);
  });

  it('reveals one letter as the hint, without counting a wrong guess', () => {
    const p = applyHint('hangman', ctx, initProgress('hangman', ctx)) as {
      guessed: string[];
      wrong: number;
    };
    expect(p.guessed).toHaveLength(1);
    expect(p.wrong).toBe(0);
    const view = publicView('hangman', ctx, p as unknown as Json) as { hinted: string };
    expect(view.hinted).toBe(p.guessed[0]);
  });
});

describe('Spot the Difference', () => {
  const ctx = ctxFor('spot_difference');
  // The sample areas (centre and radius, in image pixels). Tolerance 4% of 800 = 32 px.
  const areas = [
    [430, 105, 45],
    [235, 95, 40],
    [650, 140, 45],
    [120, 290, 35],
    [565, 445, 40],
    [705, 385, 35],
    [230, 520, 40],
  ] as const;

  it('is solved when all 7 differences are clicked', () => {
    const r = play(
      'spot_difference',
      ctx,
      areas.map(([x, y]) => ({ x: x + 10, y: y - 10 })),
    );
    expect(r.statuses).toEqual([...Array(6).fill('correct'), 'solved']);
  });

  it('is forgiving: a click just outside a difference still counts', () => {
    // 45 px circle + 32 px tolerance = 77 px.
    expect(play('spot_difference', ctx, [{ x: 430 + 75, y: 105 }]).statuses).toEqual(['correct']);
    expect(play('spot_difference', ctx, [{ x: 430 + 79, y: 105 }]).statuses).toEqual(['wrong']);
    const none = { ...ctx, tasks: { ...ctx.tasks, spotDifferenceTolerancePercent: 0 } };
    expect(play('spot_difference', none, [{ x: 430 + 50, y: 105 }]).statuses).toEqual(['wrong']);
  });

  it('counts the nearest difference when a click is near two', () => {
    // Between the sun (235, 95) and the clock (430, 105), nearer the clock's edge.
    const r = play('spot_difference', ctx, [{ x: 370, y: 100 }]);
    const view = publicView('spot_difference', ctx, r.progress) as { found: { x: number }[] };
    expect(view.found).toEqual([{ x: 430, y: 105, r: 45 }]);
  });

  it('does not count a miss or the same difference twice', () => {
    expect(
      play('spot_difference', ctx, [
        { x: 0, y: 590 },
        { x: 430, y: 105 },
        { x: 431, y: 106 },
      ]).statuses,
    ).toEqual(['wrong', 'correct', 'wrong']);
  });
});

describe('Alien Translator', () => {
  const ctx = ctxFor('alien_translator');
  type Pair = { symbol: string; letter: string };
  type AlienView = { content: { message: string[]; legend: Pair[] }; hintLegend: Pair[] };

  // The message as the team sees it: known letters filled in, "_" for the rest.
  function screenText(view: AlienView, extra: Pair[] = []): string {
    const known = new Map([...view.content.legend, ...extra].map((p) => [p.symbol, p.letter]));
    return view.content.message.map((s) => (s === ' ' ? ' ' : (known.get(s) ?? '_'))).join('');
  }

  it('checks the translation', () => {
    expect(
      play('alien_translator', ctx, [{ answer: 'The Purple  Moon rises at dawn' }]).statuses,
    ).toEqual(['solved']);
    expect(
      play('alien_translator', ctx, [{ answer: 'the purple moon sets at dawn' }]).statuses,
    ).toEqual(['wrong']);
  });

  it('fills in every legend letter on the start screen and no other', () => {
    const view = publicView(
      'alien_translator',
      ctx,
      initProgress('alien_translator', ctx),
    ) as AlienView;
    expect(screenText(view)).toBe('THE __R__E _OON R_SES AT _A_N');
    // Every legend symbol is in the message, so every known letter shows somewhere.
    for (const pair of view.content.legend) expect(view.content.message).toContain(pair.symbol);
  });

  it('decodes 3 more symbols as the hint: P, U and L', () => {
    const view = publicView(
      'alien_translator',
      ctx,
      applyHint('alien_translator', ctx, initProgress('alien_translator', ctx)),
    ) as AlienView;
    expect(view.hintLegend.map((p) => p.letter)).toEqual(['P', 'U', 'L']);
    expect(screenText(view, view.hintLegend)).toBe('THE PURPLE _OON R_SES AT _A_N');
  });
});

describe('question tasks (Riddle, Data Story)', () => {
  it('Riddle is solved when all 3 are right, in any order', () => {
    const r = play('riddle', ctxFor('riddle'), [
      { index: 2, answer: 'A Comb' },
      { index: 0, answer: 'banana' },
      { index: 0, answer: 'keyboard' },
      { index: 1, answer: 'footsteps' },
    ]);
    expect(r.statuses).toEqual(['correct', 'wrong', 'correct', 'solved']);
  });

  it('Riddle ignores case, spaces, punctuation and a/an/the, and accepts alternatives', () => {
    const ctx = ctxFor('riddle');
    for (const answer of [
      'The Keyboard.',
      'key board',
      'a computer-keyboard',
      '  LAPTOP KEYBOARD!',
    ]) {
      expect(play('riddle', ctx, [{ index: 0, answer }]).statuses, answer).toEqual(['correct']);
    }
    for (const answer of ['foot steps', 'Footprints', 'the steps']) {
      expect(play('riddle', ctx, [{ index: 1, answer }]).statuses, answer).toEqual(['correct']);
    }
    for (const answer of ['the', 'a', '...', 'keyboards', 'board']) {
      expect(play('riddle', ctx, [{ index: 0, answer }]).statuses, answer).toEqual(['wrong']);
    }
  });

  it('Riddle hint gives the clue for the first unanswered riddle', () => {
    const ctx = ctxFor('riddle');
    const r = play('riddle', ctx, [{ index: 0, answer: 'keyboard' }]);
    const view = publicView('riddle', ctx, applyHint('riddle', ctx, r.progress)) as {
      hint: { index: number; text: string };
    };
    expect(view.hint).toEqual({ index: 1, text: 'You make them when you walk.' });
  });

  it('ignores a question that does not exist or is already answered', () => {
    const r = play('riddle', ctxFor('riddle'), [
      { index: 5, answer: 'keyboard' },
      { index: 0, answer: 'keyboard' },
      { index: 0, answer: 'keyboard' },
    ]);
    expect(r.statuses).toEqual(['invalid', 'correct', 'invalid']);
  });

  it('Data Story answers are forgiving about case, articles and number formatting', () => {
    const r = play('data_story', ctxFor('data_story'), [
      { index: 0, answer: 'the SOUTH region' },
      { index: 1, answer: 'Jun.' },
      { index: 2, answer: 'Twenty-Two' },
    ]);
    expect(r.statuses).toEqual(['correct', 'correct', 'solved']);
  });

  it('Data Story gives the chart to look at as the hint', () => {
    const ctx = ctxFor('data_story');
    const r = play('data_story', ctx, [{ index: 0, answer: 'the South' }]);
    const view = publicView('data_story', ctx, applyHint('data_story', ctx, r.progress)) as {
      hint: { index: number; text: string };
    };
    expect(view.hint).toEqual({ index: 1, text: 'orders' });
  });
});

describe('Guess the Celebrity', () => {
  const ctx = ctxFor('guess_celebrity');
  type View = {
    taskName: string;
    imageUrl: string | null;
    position: number;
    total: number;
    named: string[];
    canPass: boolean;
    hint: string | null;
  };
  const view = (progress: Json) => publicView('guess_celebrity', ctx, progress) as View;
  const start = () => initProgress('guess_celebrity', ctx) as CelebrityProgress;
  // The sample faces are labelled Sample 1 to 8; face-3 is "sample three".
  const nameOf = (faceId: string) => `sample ${faceId.replace('face-', '')}`;

  it('plays the number of photos set in the settings, drawn from the content', () => {
    expect(start().order).toHaveLength(8);
    const four = { ...ctx, tasks: { ...ctx.tasks, guessCelebrityFaces: 4 } };
    const p = initProgress('guess_celebrity', four) as CelebrityProgress;
    expect(p.order).toHaveLength(4);
    expect(new Set(p.order).size).toBe(4);
    // More than the content holds plays every photo once.
    const many = { ...ctx, tasks: { ...ctx.tasks, guessCelebrityFaces: 20 } };
    expect((initProgress('guess_celebrity', many) as CelebrityProgress).order).toHaveLength(8);
  });

  it('is solved when every photo is named; a wrong name costs nothing', () => {
    const p = start();
    const names = p.order.map(nameOf);
    const r = play('guess_celebrity', ctx, [
      { answer: 'somebody else' },
      ...names.map((answer) => ({ answer })),
    ]);
    expect(r.statuses).toEqual(['wrong', ...names.slice(1).map(() => 'correct'), 'solved']);
  });

  it('sends only the photo on screen, never the other photos or any name', () => {
    const p = start();
    const v = view(p);
    const current = ctx.publicData as { faces: { id: string; imageUrl: string }[] };
    const shown = current.faces.find((f) => f.id === p.order[0]);
    expect(v.imageUrl).toBe(shown?.imageUrl);
    const text = JSON.stringify(v);
    for (const f of current.faces) {
      if (f.id !== p.order[0]) expect(text).not.toContain(f.imageUrl);
      expect(text).not.toContain(f.id);
    }
    expect(text).not.toMatch(/sample (\d|one|two|three|four|five|six|seven|eight)/i);
    expect(v).toMatchObject({ taskName: 'Guess the Celebrity', position: 1, total: 8, named: [] });
  });

  it('Pass moves to the next unnamed photo and passed photos come back later', () => {
    const p = start();
    const first = nameOf(p.order[0] ?? '');
    const r = play('guess_celebrity', ctx, [{ pass: true }]);
    expect(r.statuses).toEqual(['correct']);
    expect(view(r.progress).position).toBe(2);
    // Name every other photo; the passed one comes round again last.
    const rest = p.order.slice(1).map((id) => ({ answer: nameOf(id) }));
    const r2 = play('guess_celebrity', ctx, [{ pass: true }, ...rest]);
    expect(view(r2.progress)).toMatchObject({ position: 1, canPass: false });
    const r3 = play('guess_celebrity', ctx, [
      { pass: true },
      ...rest,
      { pass: true },
      { answer: first },
    ]);
    expect(r3.statuses.slice(-2)).toEqual(['invalid', 'solved']);
  });

  it('matches names ignoring case, spaces, dots and hyphens, with one typo on long names', () => {
    const p = start();
    const withNames = (names: string[]) =>
      ({
        ...ctx,
        secretData: { names: Object.fromEntries(p.order.map((id) => [id, names])) },
      }) as CheckerContext<TaskKey>;
    const one = (c: CheckerContext<TaskKey>, answer: string) =>
      checkSubmission('guess_celebrity', c, p as unknown as Json, { answer }).status;
    const dhoni = withNames(['MS Dhoni', 'Dhoni', 'Mahendra Singh Dhoni']);
    expect(one(dhoni, 'M.S. Dhoni')).toBe('correct');
    expect(one(dhoni, 'dhoni')).toBe('correct');
    expect(one(dhoni, 'Mahendra-Singh  DHONI')).toBe('correct');
    // "Dhoni" has 5 letters, so it must be exact; "msdhoni" has 7, so one typo passes.
    expect(one(dhoni, 'dhony')).toBe('wrong');
    expect(one(dhoni, 'ms dhony')).toBe('correct');
    expect(one(dhoni, 'ms dhnoi')).toBe('correct');
    expect(one(dhoni, 'm dhony')).toBe('wrong');
    const srk = withNames(['Shah Rukh Khan', 'Shahrukh Khan', 'SRK']);
    expect(one(srk, 'Shahrukh Khan')).toBe('correct');
    expect(one(srk, 'Sharukh Khan')).toBe('correct');
    expect(one(srk, 'shah rukh kahn')).toBe('correct');
    expect(one(srk, 'salman khan')).toBe('wrong');
    expect(one(srk, 'srk')).toBe('correct');
    expect(one(srk, 'srx')).toBe('wrong');
  });

  it('hint shows the first letter of each word of the name on screen, for that photo only', () => {
    const p = start();
    const hinted = applyHint('guess_celebrity', ctx, p as unknown as Json);
    const names = (ctx.secretData as { names: Record<string, string[]> }).names;
    // The first accepted name is used: "sample three" gives "S_____ T____".
    const word = names[p.order[0] ?? '']?.[0]?.split(' ')[1] ?? '';
    expect(view(hinted).hint).toBe(
      `S_____ ${word[0]?.toUpperCase()}${'_'.repeat(word.length - 1)}`,
    );
    const passed = checkSubmission('guess_celebrity', ctx, hinted, { pass: true });
    expect(passed.status === 'correct' && view(passed.progress).hint).toBeNull();
    expect(nameHint('Shah Rukh Khan')).toBe('S___ R___ K___');
    expect(nameHint('M.S. Dhoni')).toBe('M.S. D____');
  });
});

describe('Pictionary', () => {
  const ctx = ctxFor('pictionary');
  type PictionaryView = {
    drawing: { strokes: number[][][] } | null;
    current: number;
    total: number;
    guesses: string[];
    hint: { index: number; letter: string } | null;
  };
  const view = (progress: Json) => publicView('pictionary', ctx, progress) as PictionaryView;

  it('guesses the 5 words in order', () => {
    const r = play('pictionary', ctx, [
      { answer: 'cup' },
      { answer: 'key' },
      { answer: 'mug' },
      { answer: 'light bulb' },
      { answer: 'laptop' },
      { answer: 'rocket' },
    ]);
    expect(r.statuses).toEqual(['wrong', 'correct', 'correct', 'correct', 'correct', 'solved']);
  });

  it('is forgiving: case, spaces, punctuation, a/an/the and simple plurals', () => {
    for (const answer of ['KEY', 'a key.', 'keys', 'The Keys!']) {
      expect(play('pictionary', ctx, [{ answer }]).statuses, answer).toEqual(['correct']);
    }
    for (const answer of ['keyboard', 'k', 'monkey']) {
      expect(play('pictionary', ctx, [{ answer }]).statuses, answer).toEqual(['wrong']);
    }
    const onCup = play('pictionary', ctx, [{ answer: 'key' }]).progress;
    for (const answer of ['Teacup', 'coffee-mug', 'Coffee', 'tea cups']) {
      expect(checkSubmission('pictionary', ctx, onCup, { answer }).status, answer).toBe('correct');
    }
  });

  it('sends only the drawing being guessed, never the words', () => {
    const start = view(initProgress('pictionary', ctx));
    expect(start).toMatchObject({ current: 0, total: 5, guesses: [], hint: null });
    const drawings = (ctx.publicData as { drawings: unknown[] }).drawings;
    expect(start.drawing).toEqual(drawings[0]);
    const r = play('pictionary', ctx, [{ answer: 'key' }]);
    expect(view(r.progress).drawing).toEqual(drawings[1]);
    const words = ['key', 'cup', 'bulb', 'laptop', 'rocket'];
    const done = play(
      'pictionary',
      ctx,
      words.map((answer) => ({ answer })),
    );
    expect(view(done.progress).drawing).toBeNull();
  });

  it('gives the first letter of the current word as the hint, for that word only', () => {
    const r = play('pictionary', ctx, [{ answer: 'key' }]);
    const hinted = applyHint('pictionary', ctx, r.progress);
    expect(view(hinted).hint).toEqual({ index: 1, letter: 'C' });
    const next = checkSubmission('pictionary', ctx, hinted, { answer: 'cup' });
    expect(next.status === 'correct' && view(next.progress).hint).toBeNull();
  });
});

describe('Escape Room', () => {
  const ctx = ctxFor('escape_room');
  type EscapeView = {
    stages: { title: string; prompt: string; mirrorText?: string }[];
    stage: number;
    total: number;
  };
  const view = (progress: Json) => publicView('escape_room', ctx, progress) as EscapeView;

  it('clears the 4 linked stages one by one', () => {
    const r = play('escape_room', ctx, [
      { answer: 'Drawer B' },
      { answer: 'red' },
      { answer: 'Blue' },
      { answer: '7' },
      { answer: 'twenty-eight' },
    ]);
    expect(r.statuses).toEqual(['correct', 'wrong', 'correct', 'correct', 'solved']);
  });

  it('sends a stage only after the one before is checked', () => {
    const start = view(initProgress('escape_room', ctx));
    expect(start.stages.map((s) => s.title)).toEqual(['Find the key']);
    expect(JSON.stringify(start)).not.toContain('FOLDER');
    const r = play('escape_room', ctx, [{ answer: 'b' }]);
    const second = view(r.progress);
    expect(second.stages).toHaveLength(2);
    expect(second.stages[1]?.mirrorText).toBe('THE CARD IS IN THE BLUE FOLDER');
    expect(JSON.stringify(second)).not.toContain('TFWFO');
  });

  it('gives help on the current stage as the hint', () => {
    const r = play('escape_room', ctx, [{ answer: 'b' }]);
    const p = applyHint('escape_room', ctx, r.progress) as { hint: unknown };
    expect(p.hint).toEqual({ stage: 1, text: 'Read each line from right to left.' });
  });
});

describe('Ethical Dilemma', () => {
  const ctx = ctxFor('ethical_dilemma');

  it('passes any complete answer and saves it', () => {
    const r = play('ethical_dilemma', ctx, [{ choice: 1, reason: '  Talk first. ' }]);
    expect(r.statuses).toEqual(['solved']);
    expect(r.progress).toEqual({ choice: 1, reason: 'Talk first.' });
  });

  it('needs a valid option and a reason', () => {
    expect(
      play('ethical_dilemma', ctx, [
        { choice: 4, reason: 'x' },
        { choice: 0, reason: '  ' },
      ]).statuses,
    ).toEqual(['invalid', 'invalid']);
  });
});

describe('public views', () => {
  // Every secret string (answers, clues, hit areas, phrases) must stay on the server
  // until the team earns it. Short strings (single letters and digits) are skipped
  // because they also appear in normal public content.
  function secretStrings(value: unknown): string[] {
    if (typeof value === 'string') return value.length >= 3 ? [value] : [];
    if (Array.isArray(value)) return value.flatMap(secretStrings);
    if (value && typeof value === 'object') return Object.values(value).flatMap(secretStrings);
    return [];
  }

  it.each(TASK_KEYS)('%s shows no secret before it is earned', (key) => {
    const ctx = ctxFor(key, key === 'vault' ? '4-2-9' : null);
    const view = JSON.stringify(publicView(key, ctx, initProgress(key, ctx)));
    // Some secret fields point at public things (Data Story hint chart ids); those are fine.
    const publicContent = JSON.stringify(ctx.publicData);
    for (const secret of secretStrings(ctx.secretData)) {
      if (!publicContent.includes(secret)) expect(view).not.toContain(secret);
    }
    if (key === 'vault') expect(view).not.toContain('836');
    if (key === 'spot_difference') expect(view).not.toContain('"x":120');
  });
});
