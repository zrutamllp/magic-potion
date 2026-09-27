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
  const solved = Array.from({ length: 12 }, (_, i) => i);

  it('starts scrambled and is solved by the right tile order', () => {
    const start = initProgress('picture_puzzle', ctx) as { order: number[] };
    expect(start.order).not.toEqual(solved);
    expect([...start.order].sort((a, b) => a - b)).toEqual(solved);
    expect(play('picture_puzzle', ctx, [{ order: solved }]).statuses).toEqual(['solved']);
  });

  it('saves a wrong order and ignores an order that is not a full set of tiles', () => {
    const swapped = [1, 0, ...solved.slice(2)];
    const r = play('picture_puzzle', ctx, [{ order: swapped }, { order: [0, 0, 1] }]);
    expect(r.statuses).toEqual(['wrong', 'invalid']);
    expect((r.progress as { order: number[] }).order).toEqual(swapped);
  });

  it('shows the correctly placed tiles after the hint', () => {
    const p = checkSubmission('picture_puzzle', ctx, initProgress('picture_puzzle', ctx), {
      order: [1, 0, ...solved.slice(2)],
    });
    if (p.status === 'invalid') throw new Error('unexpected');
    const before = publicView('picture_puzzle', ctx, p.progress) as { correctTiles: unknown };
    expect(before.correctTiles).toBeNull();
    const hinted = applyHint('picture_puzzle', ctx, p.progress);
    const view = publicView('picture_puzzle', ctx, hinted) as { correctTiles: number[] };
    expect(view.correctTiles).toEqual(solved.slice(2));
  });
});

describe('Hangman', () => {
  const ctx = ctxFor('hangman'); // "Together we achieve more"

  it('reveals matching letters and is solved when every letter is found', () => {
    const letters = [...new Set('togetherweachievemore')];
    const r = play(
      'hangman',
      ctx,
      letters.map((letter) => ({ letter })),
    );
    expect(r.statuses.at(-1)).toBe('solved');
    expect(r.statuses.slice(0, -1).every((s) => s === 'correct')).toBe(true);
  });

  it('shows only guessed letters', () => {
    const r = play('hangman', ctx, [{ letter: 'E' }]);
    const view = publicView('hangman', ctx, r.progress) as { masked: string };
    expect(view.masked).toBe('___e__e_ _e ____e_e ___e');
  });

  it('fails after 6 wrong letters', () => {
    const r = play(
      'hangman',
      ctx,
      ['b', 'd', 'f', 'j', 'k', 'l'].map((letter) => ({ letter })),
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
  });
});

describe('Spot the Difference', () => {
  const ctx = ctxFor('spot_difference');
  const hits = [
    [120, 90],
    [400, 60],
    [680, 140],
    [220, 320],
    [560, 300],
    [150, 520],
    [640, 500],
  ];

  it('is solved when all 7 differences are clicked', () => {
    const r = play(
      'spot_difference',
      ctx,
      hits.map(([x, y]) => ({ x: (x ?? 0) + 10, y: (y ?? 0) - 10 })),
    );
    expect(r.statuses).toEqual([...Array(6).fill('correct'), 'solved']);
  });

  it('does not count a miss or the same difference twice', () => {
    expect(
      play('spot_difference', ctx, [
        { x: 0, y: 0 },
        { x: 120, y: 90 },
        { x: 121, y: 91 },
      ]).statuses,
    ).toEqual(['wrong', 'correct', 'wrong']);
  });
});

describe('Alien Translator', () => {
  const ctx = ctxFor('alien_translator');

  it('checks the translation', () => {
    expect(play('alien_translator', ctx, [{ answer: 'SHARE  IDEAS' }]).statuses).toEqual([
      'solved',
    ]);
    expect(play('alien_translator', ctx, [{ answer: 'shave ideas' }]).statuses).toEqual(['wrong']);
  });

  it('decodes 3 more symbols as the hint', () => {
    const p = applyHint('alien_translator', ctx, initProgress('alien_translator', ctx)) as {
      hintLegend: unknown[];
    };
    expect(p.hintLegend).toHaveLength(3);
  });
});

describe('question tasks (Riddle, Sound Sleuth, Data Story)', () => {
  it('Riddle is solved when all 3 are right, in any order', () => {
    const r = play('riddle', ctxFor('riddle'), [
      { index: 2, answer: 'A Clock' },
      { index: 0, answer: 'banana' },
      { index: 0, answer: 'piano' },
      { index: 1, answer: 'towel' },
    ]);
    expect(r.statuses).toEqual(['correct', 'wrong', 'correct', 'solved']);
  });

  it('ignores a question that does not exist or is already answered', () => {
    const r = play('riddle', ctxFor('riddle'), [
      { index: 5, answer: 'piano' },
      { index: 0, answer: 'piano' },
      { index: 0, answer: 'piano' },
    ]);
    expect(r.statuses).toEqual(['invalid', 'correct', 'invalid']);
  });

  it('Sound Sleuth accepts any listed spelling', () => {
    const r = play('sound_sleuth', ctxFor('sound_sleuth'), [
      { index: 0, answer: 'Red' },
      { index: 1, answer: '4' },
      { index: 2, answer: "Nine O'Clock" },
    ]);
    expect(r.statuses).toEqual(['correct', 'correct', 'solved']);
  });

  it('Data Story gives the chart to look at as the hint', () => {
    const ctx = ctxFor('data_story');
    const r = play('data_story', ctx, [{ index: 0, answer: 'north' }]);
    const view = publicView('data_story', ctx, applyHint('data_story', ctx, r.progress)) as {
      hint: { index: number; text: string };
    };
    expect(view.hint).toEqual({ index: 1, text: 'visitors' });
  });
});

describe('Pictionary', () => {
  const ctx = ctxFor('pictionary');

  it('guesses the 5 words in order', () => {
    const r = play('pictionary', ctx, [
      { answer: 'house' },
      { answer: 'sun' },
      { answer: 'home' },
      { answer: 'tree' },
      { answer: 'fish' },
      { answer: 'star' },
    ]);
    expect(r.statuses).toEqual(['wrong', 'correct', 'correct', 'correct', 'correct', 'solved']);
  });

  it('sends only the drawings up to the current word', () => {
    const r = play('pictionary', ctx, [{ answer: 'sun' }]);
    const view = publicView('pictionary', ctx, r.progress) as { drawings: unknown[] };
    expect(view.drawings).toHaveLength(2);
  });

  it('gives the first letter of the current word as the hint', () => {
    const r = play('pictionary', ctx, [{ answer: 'sun' }]);
    const p = applyHint('pictionary', ctx, r.progress) as { hint: unknown };
    expect(p.hint).toEqual({ index: 1, letter: 'H' });
  });
});

describe('Escape Room', () => {
  const ctx = ctxFor('escape_room');

  it('clears the stages one by one', () => {
    const r = play('escape_room', ctx, [
      { answer: 'chair' },
      { answer: 'workteam' },
      { answer: 'teamwork' },
      { answer: 'share' },
      { answer: 'thirteen' },
    ]);
    expect(r.statuses).toEqual(['correct', 'wrong', 'correct', 'correct', 'solved']);
  });

  it('sends a stage only after the one before is cleared', () => {
    const start = publicView('escape_room', ctx, initProgress('escape_room', ctx)) as {
      stages: unknown[];
    };
    expect(start.stages).toHaveLength(1);
    const r = play('escape_room', ctx, [{ answer: 'chair' }]);
    expect(
      (publicView('escape_room', ctx, r.progress) as { stages: unknown[] }).stages,
    ).toHaveLength(2);
  });

  it('gives help on the current stage as the hint', () => {
    const p = applyHint('escape_room', ctx, initProgress('escape_room', ctx)) as { hint: unknown };
    expect(p.hint).toEqual({ stage: 0, text: 'Look down.' });
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
