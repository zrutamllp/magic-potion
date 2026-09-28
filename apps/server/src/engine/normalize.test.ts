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

  it('loose rule keeps numbers apart: commas drop, decimal points stay', () => {
    expect(matchesAnyLoose('1,650', ['1650'])).toBe(true);
    expect(matchesAnyLoose('12.5', ['12.5'])).toBe(true);
    expect(matchesAnyLoose('12.5', ['125'])).toBe(false);
    expect(matchesAnyLoose('22.', ['22'])).toBe(true);
    expect(matchesAnyLoose('June.', ['june'])).toBe(true);
    expect(normalizeLoose('Rs. 1,20,000')).toBe('rs120000');
  });
});
