import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeftRight, HandCoins, Send } from 'lucide-react';
import type { FeedItem } from '@magic-potion/shared';
import { feedText } from '../../lib/feed';
import { money } from '../../lib/time';
import { useGame } from '../GameContext';
import { Button, Card, PageTitle, fieldClass } from '../ui/basics';

// Chat: one channel for all teams, a message limit per round. Transfers and requests this
// team is part of show as small event lines. No call, video or attachment buttons.

// A steady colour per team name, so teams are easy to tell apart.
const NAME_COLOURS = ['text-info', 'text-success', 'text-warning', 'text-alert', 'text-brand-soft'];
export function nameColour(teamId: string): string {
  let h = 0;
  for (const c of teamId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return NAME_COLOURS[h % NAME_COLOURS.length] ?? 'text-info';
}

export function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function Chat() {
  const { state, feed, act, send } = useGame();
  const [body, setBody] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const { messagesLeft, messagesPerRound, maxLength } = state.chat;
  const open = state.game.timersRunning;
  const canSend = open && messagesLeft > 0;

  // Keep the newest line in view.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [feed.length]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await act('Message sent.', () => send('chat:send', { body }))) setBody('');
  }

  return (
    <>
      <PageTitle title="Chat" tone="info" subtitle="One chat for all teams" />
      <Card className="flex h-[calc(100vh-19rem)] min-h-[26rem] flex-col p-0">
        <ol ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-5" aria-label="Messages">
          {feed.length === 0 && (
            <li className="py-10 text-center text-xl text-ink-muted">No messages yet.</li>
          )}
          {feed.map((item) => (
            <FeedLine key={`${item.kind}:${item.id}`} item={item} ownTeamId={state.team.id} />
          ))}
        </ol>
        <form onSubmit={submit} className="border-t border-line p-4">
          <div className="flex gap-3">
            <input
              className={`${fieldClass} flex-1`}
              placeholder={
                !open
                  ? 'Chat is closed right now'
                  : messagesLeft > 0
                    ? 'Type your message…'
                    : 'No messages left this round'
              }
              aria-label="Message"
              value={body}
              maxLength={maxLength}
              disabled={!canSend}
              onChange={(e) => setBody(e.target.value)}
            />
            <Button type="submit" tone="brand" disabled={!canSend || body.trim() === ''}>
              <Send className="h-5 w-5" aria-hidden /> Send
            </Button>
          </div>
          <p
            className={`mt-2 text-lg font-semibold ${messagesLeft === 0 ? 'text-danger' : 'text-ink-muted'}`}
          >
            Messages left: {messagesLeft} of {messagesPerRound}
          </p>
        </form>
      </Card>
    </>
  );
}

function FeedLine({ item, ownTeamId }: { item: FeedItem; ownTeamId: string }) {
  if (item.kind !== 'chat') {
    const Icon = item.kind === 'transfer' ? ArrowLeftRight : HandCoins;
    return (
      <li className="flex justify-center">
        <span className="flex items-center gap-2 rounded-full border border-info/40 bg-info/10 px-4 py-1.5 text-base text-info">
          <Icon className="h-4 w-4" aria-hidden />
          {feedText(item, money)} · {clockTime(item.at)}
        </span>
      </li>
    );
  }
  const own = item.teamId === ownTeamId;
  return (
    <li className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}>
      <span className="mb-1 flex items-baseline gap-2">
        <span className={`text-lg font-bold ${own ? 'text-brand-soft' : nameColour(item.teamId)}`}>
          {own ? `${item.teamName} (you)` : item.teamName}
        </span>
        <span className="text-sm text-ink-muted">{clockTime(item.at)}</span>
      </span>
      <p
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-lg break-words ${
          own ? 'rounded-tr-sm bg-brand text-white' : 'rounded-tl-sm bg-card-raised'
        }`}
      >
        {item.body}
      </p>
    </li>
  );
}
