import { useState, type FormEvent } from 'react';
import { CheckCircle2, Lightbulb, RotateCcw, XCircle } from 'lucide-react';
import { Button, Card } from '../ui/basics';
import { useTaskSubmit } from './parts';
import type { TaskPlayProps } from './TaskShell';

// Pictionary: the game draws a picture stroke by stroke from the strokes the server sends; the
// team guesses the word. The words never reach the browser: every guess is checked on the
// server. Only the picture being guessed is sent.

type Point = [number, number];

interface PictionaryView {
  drawing: { strokes: Point[][] } | null;
  // Index of the word being guessed, from 0.
  current: number;
  total: number;
  // The team's right guesses, in order.
  guesses: string[];
  hint: { index: number; letter: string } | null;
}

// About how long one whole picture takes to draw.
export const DRAW_SECONDS = 6;

const strokeLength = (s: Point[]) =>
  s.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - s[i]![0], p[1] - s[i]![1]), 0);

// When each stroke starts and how long it takes, in seconds, in drawing order. Longer strokes
// take longer, so the pen moves at an even speed.
export function strokeTimings(strokes: Point[][]): { delay: number; duration: number }[] {
  const lengths = strokes.map(strokeLength);
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  let at = 0;
  return lengths.map((len) => {
    const duration = Math.max(0.2, (len / total) * DRAW_SECONDS);
    const timing = { delay: at, duration };
    at += duration;
    return timing;
  });
}

export function Pictionary({ task, view, hint, giveUp }: TaskPlayProps) {
  const { drawing, current, total, guesses, hint: letterHint } = view as PictionaryView;
  const [guess, setGuess] = useState('');
  // Changing this redraws the picture from the start.
  const [replays, setReplays] = useState(0);
  const { submit, feedback, busy } = useTaskSubmit(task.id);
  const strokes = drawing?.strokes ?? [];
  const timings = strokeTimings(strokes);

  async function onGuess(e: FormEvent) {
    e.preventDefault();
    const ack = await submit({ answer: guess });
    const status = ack.ok ? (ack.value as { status?: string } | undefined)?.status : undefined;
    if (status === 'correct' || status === 'solved') setGuess('');
  }

  return (
    <Card className="px-4 py-3">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-xl font-semibold">Guess the word from the drawing.</p>
        {hint}
        {giveUp}
      </div>

      <div className="mt-3 flex gap-6">
        <svg
          key={`${current}-${replays}`}
          viewBox="-4 -4 108 108"
          className="h-[20rem] w-[20rem] shrink-0 rounded-xl border-2 border-line bg-[#f8fafc]"
          role="img"
          aria-label={`Drawing ${current + 1}`}
          fill="none"
          stroke="#0f172a"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {strokes.map((stroke, i) => (
            <polyline
              key={i}
              points={stroke.map((p) => p.join(',')).join(' ')}
              pathLength={1}
              className="draw-stroke"
              style={{
                animationDelay: `${timings[i]?.delay ?? 0}s`,
                animationDuration: `${timings[i]?.duration ?? 1}s`,
              }}
            />
          ))}
        </svg>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-center gap-4">
            <p className="text-3xl font-extrabold">
              Word <span className="nums">{Math.min(current + 1, total)}</span> of{' '}
              <span className="nums">{total}</span>
            </p>
            <Button
              tone="muted"
              variant="outline"
              className="h-11 py-0 text-lg"
              onClick={() => setReplays((n) => n + 1)}
            >
              <RotateCcw className="h-5 w-5" aria-hidden /> Draw again
            </Button>
          </div>

          {letterHint && (
            <p className="flex items-center gap-2 text-2xl font-bold text-info">
              <Lightbulb className="h-6 w-6 shrink-0" aria-hidden /> First letter:{' '}
              {letterHint.letter}
            </p>
          )}

          <form onSubmit={onGuess} className="flex gap-2">
            <input
              aria-label="Your guess"
              value={guess}
              maxLength={200}
              autoComplete="off"
              autoFocus
              onChange={(e) => setGuess(e.target.value)}
              className="h-14 min-w-0 flex-1 rounded-xl border-2 border-line bg-page px-4 text-2xl focus:border-brand focus:outline-none"
            />
            <Button
              type="submit"
              tone="success"
              className="h-14 px-6 py-0 text-2xl"
              disabled={busy || guess.trim() === ''}
            >
              Guess
            </Button>
          </form>

          {feedback && (
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
              {feedback.tone === 'good' ? 'Correct! Next drawing.' : feedback.text}
            </p>
          )}

          <section aria-label="Guessed" className="mt-auto">
            <h2 className="text-lg font-bold text-ink-muted">
              Guessed: <span className="nums">{guesses.length}</span> of{' '}
              <span className="nums">{total}</span>
            </h2>
            <ul className="mt-1.5 flex flex-wrap gap-2">
              {guesses.map((g, i) => (
                <li
                  key={i}
                  className="flex items-center gap-1.5 rounded-full border border-success/50 bg-success/15 px-3 py-1 text-lg font-bold text-success"
                >
                  <CheckCircle2 className="h-5 w-5" aria-hidden /> {g}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </Card>
  );
}
