import { useState, type FormEvent } from 'react';
import { CheckCircle2, Lightbulb, SkipForward, XCircle } from 'lucide-react';
import { Button, Card } from '../ui/basics';
import { useTaskSubmit } from './parts';
import type { TaskPlayProps } from './TaskShell';

// Guess the Celebrity: name the person in the photo, one photo at a time. Pass moves to the
// next photo; passed photos come back later. A wrong name costs nothing. The server sends only
// the photo on screen and checks every name.

interface CelebrityView {
  taskName: string;
  imageUrl: string | null;
  // "Face 3 of 8"
  position: number;
  total: number;
  // Names the team got right, in the order they were played.
  named: string[];
  canPass: boolean;
  // "S___ K___" for the photo on screen, once the hint is used.
  hint: string | null;
}

export function GuessCelebrity({ task, view, hint, giveUp }: TaskPlayProps) {
  const { imageUrl, position, total, named, canPass, hint: nameHint } = view as CelebrityView;
  const [name, setName] = useState('');
  // What the last action was, so the message fits it.
  const [last, setLast] = useState<'guess' | 'pass' | null>(null);
  const { submit, feedback, busy, clearFeedback } = useTaskSubmit(task.id);

  async function onGuess(e: FormEvent) {
    e.preventDefault();
    setLast('guess');
    const ack = await submit({ answer: name });
    const status = ack.ok ? (ack.value as { status?: string } | undefined)?.status : undefined;
    if (status === 'correct' || status === 'solved') setName('');
  }

  async function onPass() {
    setLast('pass');
    clearFeedback();
    const ack = await submit({ pass: true });
    if (ack.ok) setName('');
  }

  const message =
    feedback === null
      ? null
      : last === 'pass' && feedback.tone === 'good'
        ? { tone: 'info' as const, text: 'Passed. It comes back later.' }
        : feedback.tone === 'good'
          ? { tone: 'good' as const, text: 'Correct! Next photo.' }
          : { tone: 'bad' as const, text: feedback.text };

  return (
    <Card className="px-4 py-3">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-xl font-semibold">Name the person in the photo.</p>
        {hint}
        {giveUp}
      </div>

      <div className="mt-3 flex gap-6">
        <div
          className="h-[19.5rem] shrink-0 overflow-hidden rounded-xl border-2 border-line bg-card-raised"
          style={{ aspectRatio: '4 / 5' }}
        >
          {imageUrl && (
            <img
              key={imageUrl}
              src={imageUrl}
              alt={`Face ${position} of ${total}`}
              draggable={false}
              className="h-full w-full object-cover select-none"
            />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <p className="text-3xl font-extrabold">
            Face <span className="nums">{position}</span> of <span className="nums">{total}</span>
          </p>

          {nameHint && (
            <p className="flex items-center gap-2 text-2xl font-bold text-info">
              <Lightbulb className="h-6 w-6 shrink-0" aria-hidden />
              Hint: <span className="font-mono tracking-widest">{nameHint}</span>
            </p>
          )}

          <form onSubmit={onGuess} className="flex gap-2">
            <input
              aria-label="Name"
              value={name}
              maxLength={200}
              autoComplete="off"
              autoFocus
              onChange={(e) => setName(e.target.value)}
              className="h-14 min-w-0 flex-1 rounded-xl border-2 border-line bg-page px-4 text-2xl focus:border-brand focus:outline-none"
            />
            <Button
              type="submit"
              tone="success"
              className="h-14 px-6 py-0 text-2xl"
              disabled={busy || name.trim() === ''}
            >
              Guess
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <Button
              tone="muted"
              variant="outline"
              className="h-12 py-0 text-xl"
              disabled={busy || !canPass}
              onClick={() => void onPass()}
            >
              <SkipForward className="h-5 w-5" aria-hidden /> Pass
            </Button>
            {message && (
              <p
                role="status"
                className={`flex items-center gap-2 text-xl font-bold ${
                  message.tone === 'good'
                    ? 'text-success'
                    : message.tone === 'bad'
                      ? 'text-danger'
                      : 'text-info'
                }`}
              >
                {message.tone === 'bad' ? (
                  <XCircle className="h-6 w-6 shrink-0" aria-hidden />
                ) : message.tone === 'info' ? (
                  <SkipForward className="h-6 w-6 shrink-0" aria-hidden />
                ) : (
                  <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden />
                )}
                {message.text}
              </p>
            )}
          </div>

          <section aria-label="Named" className="mt-auto">
            <h2 className="text-lg font-bold text-ink-muted">
              Named: <span className="nums">{named.length}</span> of{' '}
              <span className="nums">{total}</span>
            </h2>
            <ul className="mt-1.5 flex flex-wrap gap-2">
              {named.map((n, i) => (
                <li
                  key={i}
                  className="flex items-center gap-1.5 rounded-full border border-success/50 bg-success/15 px-3 py-1 text-lg font-bold text-success"
                >
                  <CheckCircle2 className="h-5 w-5" aria-hidden /> {n}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </Card>
  );
}
