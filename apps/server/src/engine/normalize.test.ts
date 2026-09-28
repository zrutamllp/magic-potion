import { describe, expect, it } from 'vitest';
import { matchesAny, matchesAnyLoose, normalizeLoose } from './normalize';

describe('answer matching', () => {
  it('normal rule: trims, lowercases and collapses spaces only', () => {
    expect(matchesAny('  Nine  OClock ', ['nine oclock'])).toBe(true);
    expect(matchesAny('the clock', ['clock'])).toBe(false);
    expect(matchesAny('   ', [''])).toBe(false);
  });

  it('loose rule (Riddle): also drops punctuation, all spaces and a/an/the', () => {
    expect(normalizeLoose('The Tooth-Brush.')).toBe('toothbrush');
    expect(normalizeLoose('An  egg!')).toBe('egg');
    expect(normalizeLoose('A b c')).toBe('bc');
    expect(matchesAnyLoose('foot steps', ['footsteps'])).toBe(true);
    expect(matchesAnyLoose('THE ANSWER', ['answer'])).toBe(true);
    // Words that only contain an article are kept whole.
    expect(matchesAnyLoose('theatre', ['atre'])).toBe(false);
    expect(matchesAnyLoose('the', ['the'])).toBe(false);
    expect(matchesAnyLoose('?!', ['x'])).toBe(false);
  });
});
