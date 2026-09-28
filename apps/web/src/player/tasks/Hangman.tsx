import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Heart, Lightbulb, XCircle } from 'lucide-react';
import { Card, Chip } from '../ui/basics';
import { useTaskSubmit, type Feedback } from './parts';
import type { TaskPlayProps } from './TaskShell';

// Hangman: guess the phrase one letter at a time. The server holds the phrase and sends back
// only the letters found so far. Too many wrong letters fails the try.

interface HangmanView {
  content: { category: string };
  // The phrase with "_" for each letter not found yet.
  masked: string;
  // Lowercase letters guessed so far, including the hint letter.
  guessed: string[];
  wrong: number;
  maxWrong: number;
  hinted: string | null;
}

const ALPHABET = [...'abcdefghijklmnopqrstuvwxyz'];

export function Hangman({ task, view }: TaskPlayProps) {
  const { content, masked, guessed, wrong, maxWrong, hinted } = view as HangmanView;
  const { submit } = useTaskSubmit(task.id);
  // Letters sent and not answered yet. Fast typing queues letters; the server takes them in order.
  const [pending, setPending] = useState<string[]>([]);
  // The same, updated at once, so a double key press never sends a letter twice.
  const sending = useRef(new Set<string>());
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // A guessed letter is right if it shows in the phrase.
  const inPhrase = new Set(masked.toLowerCase().replace(/[^a-z]/g, ''));
  const wrongLetters = guessed.filter((l) => !inPhrase.has(l));
  const livesLeft = Math.max(0, maxWrong - wrong);

  async function guess(letter: string) {
    if (guessed.includes(letter) || sending.current.has(letter)) return;
    sending.current.add(letter);
    setPending((p) => [...p, letter]);
    const ack = await submit({ letter });
    sending.current.delete(letter);
    setPending((p) => p.filter((l) => l !== letter));
    const status = ack.ok ? (ack.value as { status?: string } | undefined)?.status : undefined;
    const L = letter.toUpperCase();
    if (!ack.ok) setFeedback({ tone: 'bad', text: ack.message });
    else if (status === 'correct' || status === 'solved')
      setFeedback({ tone: 'good', text: `${L} is in the phrase.` });
    else setFeedback({ tone: 'bad', text: `${L} is not in the phrase.` });
  }

  // The computer keyboard works too.
  const guessRef = useRef(guess);
  useEffect(() => {
    guessRef.current = guess;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (/^[a-z]$/i.test(e.key)) void guessRef.current(e.key.toLowerCase());
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Card className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chip tone="info">
          <span className="text-base">Category: {content.category}</span>
        </Chip>
        <div
          className="flex items-center gap-3"
          aria-label={`Lives left: ${livesLeft} of ${maxWrong}`}
        >
          <span className="flex gap-1" aria-hidden>
            {Array.from({ length: maxWrong }, (_, i) => (
              <Heart
                key={i}
                className={`h-7 w-7 ${i < livesLeft ? 'fill-danger text-danger' : 'text-line'}`}
              />
            ))}
          </span>
          <span className="text-xl font-bold">
            Lives left: <span className="nums">{livesLeft}</span> of {maxWrong}
          </span>
        </div>
        {/* Next to the lives, so the hint never makes the card taller. */}
        {hinted && (
          <p className="flex items-center gap-1 text-lg font-semibold text-info">
            <Lightbulb className="h-5 w-5" aria-hidden /> Hint: {hinted.toUpperCase()}
          </p>
        )}
      </div>

      {/* One group per word, so a word never breaks across lines. */}
      <p
        className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2"
        aria-label={`Phrase: ${masked.toUpperCase().split('').join(' ')}`}
      >
        {masked.split(' ').map((word, w) => (
          <span key={w} className="flex gap-1" aria-hidden>
            {[...word].map((ch, i) => {
              const letter = /[a-z]/i.test(ch);
              const fromHint = hinted !== null && ch.toLowerCase() === hinted;
              return (
                <span
                  key={i}
                  className={`flex h-12 w-9 items-end justify-center pb-0.5 text-3xl font-extrabold uppercase ${
                    ch === '_' || letter ? 'border-b-4' : ''
                  } ${fromHint ? 'border-info text-info' : 'border-ink-muted'}`}
                >
                  {ch === '_' ? '' : ch}
                </span>
              );
            })}
          </span>
        ))}
      </p>

      <div className="mt-3 grid grid-cols-13 gap-1.5" aria-label="Letters">
        {ALPHABET.map((l) => {
          const used = guessed.includes(l);
          const right = used && inPhrase.has(l);
          return (
            <button
              key={l}
              type="button"
              disabled={used || pending.includes(l)}
              onClick={() => void guess(l)}
              aria-label={`Letter ${l.toUpperCase()}${used ? (right ? ', in the phrase' : ', not in the phrase') : ''}`}
              className={`flex h-11 items-center justify-center rounded-lg border-2 text-2xl font-extrabold uppercase ${
                !used
                  ? 'border-line bg-card-raised hover:border-brand'
                  : right
                    ? l === hinted
                      ? 'border-info/60 bg-info/15 text-info'
                      : 'border-success/50 bg-success/15 text-success'
                    : 'border-danger/50 bg-danger/15 text-danger line-through'
              }`}
            >
              {l}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-lg">
        <p>
          Wrong letters:{' '}
          <strong className="text-danger">
            {wrongLetters.length > 0 ? wrongLetters.map((l) => l.toUpperCase()).join(', ') : 'none'}
          </strong>
        </p>
        {/* The result of the last letter, on this line so it never makes the card taller. */}
        {feedback && (
          <p
            role="status"
            className={`flex items-center gap-1.5 font-bold ${
              feedback.tone === 'good' ? 'text-success' : 'text-danger'
            }`}
          >
            {feedback.tone === 'good' ? (
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            ) : (
              <XCircle className="h-5 w-5" aria-hidden />
            )}
            {feedback.text}
          </p>
        )}
      </div>
    </Card>
  );
}
