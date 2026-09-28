import { useState, type FormEvent } from 'react';
import { CheckCircle2, Lightbulb, XCircle } from 'lucide-react';
import { Button, Card } from '../ui/basics';
import { AlienSymbol } from './alienGlyphs';
import { useTaskSubmit } from './parts';
import type { TaskPlayProps } from './TaskShell';

// Alien Translator: translate a message written in alien symbols, with part of the legend.
// Typing a letter under one symbol fills every copy of it. The server checks the sentence.

interface Pair {
  symbol: string;
  letter: string;
}

interface AlienView {
  content: { message: string[]; legend: Pair[] };
  // The pairs the hint decoded, or empty.
  hintLegend: Pair[];
}

// The message split into words (' ' separates words), each symbol with its place in the message.
function words(message: readonly string[]): { symbol: string; n: number }[][] {
  const out: { symbol: string; n: number }[][] = [[]];
  let n = 0;
  for (const symbol of message) {
    if (symbol.trim() === '') out.push([]);
    else out[out.length - 1]?.push({ symbol, n: ++n });
  }
  return out.filter((w) => w.length > 0);
}

export function AlienTranslator({ task, view, hint, giveUp }: TaskPlayProps) {
  const { content, hintLegend } = view as AlienView;
  const [typed, setTyped] = useState<Record<string, string>>({});
  const { submit, feedback, busy } = useTaskSubmit(task.id);

  const known = new Map(content.legend.map((p) => [p.symbol, p.letter.toUpperCase()]));
  for (const p of hintLegend) known.set(p.symbol, p.letter.toUpperCase());
  const fromHint = new Set(
    hintLegend
      .filter((p) => !content.legend.some((l) => l.symbol === p.symbol))
      .map((p) => p.symbol),
  );
  const letterFor = (symbol: string) => known.get(symbol) ?? typed[symbol] ?? '';
  const message = words(content.message);
  const answer = message.map((w) => w.map((c) => letterFor(c.symbol)).join('')).join(' ');
  const complete = message.every((w) => w.every((c) => /^[A-Z]$/.test(letterFor(c.symbol))));

  function onType(symbol: string, raw: string) {
    const letter = [...raw].reverse().find((c) => /[a-z]/i.test(c)) ?? '';
    setTyped((t) => ({ ...t, [symbol]: letter.toUpperCase() }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await submit({ answer });
  }

  return (
    <Card className="px-4 py-3">
      <form onSubmit={onSubmit}>
        <div className="flex items-center gap-3">
          {/* The top line doubles as the feedback line, so a message never moves the puzzle. */}
          <div className="min-w-0 flex-1">
            {feedback ? (
              <p
                role="status"
                className={`flex items-center gap-2 text-xl font-bold ${
                  feedback.tone === 'good' ? 'text-success' : 'text-danger'
                }`}
              >
                {feedback.tone === 'good' ? (
                  <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden />
                ) : (
                  <XCircle className="h-6 w-6 shrink-0" aria-hidden />
                )}
                {feedback.text}
              </p>
            ) : (
              <p className="text-xl font-semibold">Translate the message.</p>
            )}
          </div>
          {hint}
          {giveUp}
          <Button
            type="submit"
            tone="success"
            className="h-11 shrink-0 px-5 py-0 text-xl"
            disabled={!complete || busy}
          >
            Submit
          </Button>
        </div>

        <div
          className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 rounded-xl border-2 border-line bg-card-raised px-3 py-3"
          aria-label="Alien message"
        >
          {message.map((word, w) => (
            <div key={w} className="flex gap-0.5">
              {word.map(({ symbol, n }) => {
                const fixed = known.has(symbol);
                return (
                  <div key={n} className="flex w-10 flex-col items-center gap-0.5">
                    <span className="flex h-11 w-10 items-center justify-center text-warning">
                      <AlienSymbol symbol={symbol} size={44} />
                    </span>
                    <input
                      aria-label={`Letter ${n}`}
                      value={letterFor(symbol)}
                      readOnly={fixed}
                      maxLength={2}
                      autoComplete="off"
                      onChange={(e) => onType(symbol, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className={`h-10 w-10 rounded-lg border-2 text-center text-2xl font-extrabold uppercase focus:border-brand focus:outline-none ${
                        fixed
                          ? fromHint.has(symbol)
                            ? 'border-info bg-info/25 text-info'
                            : 'border-info/60 bg-info/15 text-info'
                          : 'border-line bg-page'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </form>

      <section className="mt-3 flex items-start gap-3" aria-label="Legend">
        <h2 className="pt-2 text-xl font-bold">Legend</h2>
        <ul className="flex flex-1 flex-wrap gap-2">
          {[...known].map(([symbol, letter]) => {
            const hinted = fromHint.has(symbol);
            return (
              <li
                key={symbol}
                className={`flex items-center gap-1.5 rounded-xl border px-2 py-0.5 text-2xl font-extrabold ${
                  hinted ? 'border-info/60 bg-info/15 text-info' : 'border-line bg-card-raised'
                }`}
              >
                <span className="text-warning">
                  <AlienSymbol symbol={symbol} size={36} />
                </span>
                = {letter}
                {hinted && <Lightbulb className="h-5 w-5" aria-label="From the hint" />}
              </li>
            );
          })}
        </ul>
      </section>
    </Card>
  );
}
