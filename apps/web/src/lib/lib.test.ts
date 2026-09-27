import { describe, expect, it } from 'vitest';
import type { FeedItem } from '@magic-potion/shared';
import { feedText, upsertFeed } from './feed';
import { formatMs, money, msLeft } from './time';

describe('countdowns', () => {
  it('counts down from when the state arrived, only while running', () => {
    expect(msLeft(60_000, 1_000, true, 16_000)).toBe(45_000);
    expect(msLeft(60_000, 1_000, false, 16_000)).toBe(60_000);
    expect(msLeft(5_000, 0, true, 10_000)).toBe(0);
    expect(msLeft(null, 0, true, 10_000)).toBeNull();
  });

  it('formats time the way players read it', () => {
    expect(formatMs(45_000)).toBe('0:45');
    expect(formatMs(44_001)).toBe('0:45');
    expect(formatMs(35 * 60_000)).toBe('35:00');
    expect(formatMs(3_725_000)).toBe('1:02:05');
    expect(formatMs(0)).toBe('0:00');
    expect(formatMs(null)).toBe('--:--');
  });
});

describe('feed', () => {
  const transfer = (arrived: boolean): FeedItem => ({
    kind: 'transfer',
    id: 't1',
    at: 200,
    fromTeamId: 'a',
    fromTeamName: 'Team 1',
    toTeamId: 'b',
    toTeamName: 'Team 2',
    amount: 1500,
    arrived,
  });
  const chat: FeedItem = {
    kind: 'chat',
    id: 'c1',
    at: 100,
    teamId: 'a',
    teamName: 'Team 1',
    body: 'hi',
  };

  it('replaces a line with the same kind and id and keeps time order', () => {
    let feed = upsertFeed([], transfer(false));
    feed = upsertFeed(feed, chat);
    expect(feed.map((f) => f.id)).toEqual(['c1', 't1']);
    feed = upsertFeed(feed, transfer(true));
    expect(feed).toHaveLength(2);
    expect(feedText(feed[1] as FeedItem, money)).toBe('Team 1 sent 1,500 to Team 2 (arrived)');
  });
});
