import type { FeedItem } from '@magic-potion/shared';

// A feed line with the same kind and id replaces the old one (a transfer that arrived,
// a request that was accepted). The feed stays in time order.
export function upsertFeed(feed: readonly FeedItem[], item: FeedItem): FeedItem[] {
  const i = feed.findIndex((x) => x.kind === item.kind && x.id === item.id);
  if (i >= 0) {
    const next = [...feed];
    next[i] = item;
    return next;
  }
  const next = [...feed, item];
  next.sort((a, b) => a.at - b.at);
  return next;
}

const STATUS_TEXT = {
  PENDING: 'waiting for an answer',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
} as const;

// One line of plain text for a feed item.
export function feedText(item: FeedItem, money: (n: number) => string): string {
  switch (item.kind) {
    case 'chat':
      return item.body;
    case 'transfer':
      return `${item.fromTeamName} sent ${money(item.amount)} to ${item.toTeamName} (${
        item.arrived ? 'arrived' : 'on the way'
      })`;
    case 'request':
      return `${item.requesterTeamName} asked ${item.payerTeamName} for ${money(item.amount)} (${
        STATUS_TEXT[item.status]
      })`;
  }
}
