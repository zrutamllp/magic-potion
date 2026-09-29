import { describe, expect, it } from 'vitest';
import { AdjustFundsSchema, BroadcastMessageSchema, ExtendSchema } from './live';
import { forbiddenMatches } from './playerText';

describe('live control schemas', () => {
  it('takes a whole, non-zero fund change with a reason', () => {
    expect(AdjustFundsSchema.parse({ amount: -1500, reason: ' Wrong penalty ' })).toEqual({
      amount: -1500,
      reason: 'Wrong penalty',
    });
    expect(AdjustFundsSchema.safeParse({ amount: 0, reason: 'x' }).success).toBe(false);
    expect(AdjustFundsSchema.safeParse({ amount: 12.5, reason: 'x' }).success).toBe(false);
    expect(AdjustFundsSchema.safeParse({ amount: 100, reason: '   ' }).success).toBe(false);
  });

  it('takes an extension in whole seconds', () => {
    expect(ExtendSchema.parse({ seconds: 300 })).toEqual({ seconds: 300 });
    expect(ExtendSchema.safeParse({ seconds: 0 }).success).toBe(false);
  });

  it('needs a title and a message', () => {
    expect(BroadcastMessageSchema.safeParse({ title: 'Hi', body: '' }).success).toBe(false);
    expect(BroadcastMessageSchema.parse({ title: ' Hi ', body: ' Ten minutes left ' })).toEqual({
      title: 'Hi',
      body: 'Ten minutes left',
    });
  });
});

describe('forbiddenMatches', () => {
  it('lists the words that GAME_RULES section 16 does not allow', () => {
    expect(forbiddenMatches('Work together and Help each other')).toEqual(
      expect.arrayContaining(['work together', 'help each other', 'together', 'help']),
    );
    expect(forbiddenMatches('Ten minutes left in Round 2.')).toEqual([]);
  });
});
