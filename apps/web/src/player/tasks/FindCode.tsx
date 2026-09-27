import { useState, type FormEvent } from 'react';
import { KeyRound, Lightbulb } from 'lucide-react';
import { Button, Card } from '../ui/basics';
import { LockoutBanner, SubmitFeedback, useLockLeft, useTaskSubmit } from './parts';
import type { TaskPlayProps } from './TaskShell';

// Find the Code: decode a word written in symbols. The key shows the letters the team knows;
// symbols with no known letter show "?". Facts only (GAME_RULES section 16).

interface Pair {
  symbol: string;
  letter: string;
}

interface FindCodeView {
  content: { intro: string };
  encodedMessage: string[];
  visibleKey: Pair[];
  hint: Pair | null;
}

export function FindCode({ task, running, view }: TaskPlayProps) {
  const { content, encodedMessage, visibleKey, hint } = view as FindCodeView;
  // Letters the team types, one per symbol: typing under one ★ fills every ★.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const { submit, feedback, busy } = useTaskSubmit(task.id);
  const locked = useLockLeft(running) > 0;

  const known = new Map(visibleKey.map((p) => [p.symbol, p.letter.toUpperCase()]));
  if (hint) known.set(hint.symbol, hint.letter.toUpperCase());
  const letterFor = (symbol: string) => known.get(symbol) ?? typed[symbol] ?? '';
  const unknownSymbols = [...new Set(encodedMessage)].filter((s) => !known.has(s));
  const answer = encodedMessage.map(letterFor).join('');
  const complete = encodedMessage.every((s) => /^[A-Z]$/.test(letterFor(s)));

  function onType(symbol: string, raw: string) {
    const letter = [...raw].reverse().find((c) => /[a-z]/i.test(c)) ?? '';
    setTyped((t) => ({ ...t, [symbol]: letter.toUpperCase() }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await submit({ answer });
  }

  return (
    <>
      <Card>
        <p className="text-xl font-semibold">{content.intro}</p>
        <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-5">
          {/* One row for the whole word: tiles shrink to fit long words. */}
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${encodedMessage.length}, minmax(0, 4rem))` }}
            aria-label="Secret message"
          >
            {encodedMessage.map((symbol, i) => {
              const fixed = known.has(symbol);
              return (
                <div key={i} className="flex min-w-0 flex-col gap-2">
                  <span className="flex h-18 w-full items-center justify-center rounded-xl border-2 border-warning/50 bg-warning/10 text-4xl">
                    {symbol}
                  </span>
                  <input
                    aria-label={`Letter ${i + 1}`}
                    value={letterFor(symbol)}
                    readOnly={fixed}
                    disabled={locked}
                    maxLength={2}
                    autoComplete="off"
                    onChange={(e) => onType(symbol, e.target.value)}
                    onFocus={(e) => e.target.select()}
                    className={`h-16 w-full min-w-0 rounded-xl border-2 text-center text-4xl font-extrabold uppercase focus:border-brand focus:outline-none disabled:opacity-50 ${
                      fixed ? 'border-info/60 bg-info/15 text-info' : 'border-line bg-page'
                    }`}
                  />
                </div>
              );
            })}
          </div>
          <LockoutBanner running={running} />
          <SubmitFeedback feedback={feedback} />
          <Button
            type="submit"
            tone="success"
            className="py-3 text-2xl"
            disabled={!complete || locked || busy}
          >
            Submit the word
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <KeyRound className="h-6 w-6 text-warning" aria-hidden /> Key
        </h2>
        <ul className="mt-3 flex flex-wrap gap-3" aria-label="Key">
          {[...known].map(([symbol, letter]) => {
            const fromHint =
              hint?.symbol === symbol && !visibleKey.some((p) => p.symbol === symbol);
            return (
              <li
                key={symbol}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-2xl font-bold ${
                  fromHint ? 'border-info/60 bg-info/15 text-info' : 'border-line bg-card-raised'
                }`}
              >
                {symbol} = {letter}
                {fromHint && <Lightbulb className="h-5 w-5" aria-label="From the hint" />}
              </li>
            );
          })}
          {unknownSymbols.map((symbol) => (
            <li
              key={symbol}
              className="rounded-xl border border-dashed border-line px-4 py-2 text-2xl font-bold text-ink-muted"
            >
              {symbol} = ?
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
