import { useState, type FormEvent } from 'react';
import { Button, Card } from '../ui/basics';
import { SubmitFeedback, useTaskSubmit } from './parts';
import type { TaskPlayProps } from './TaskShell';

// Ethical Dilemma: pick one of 4 actions and give a one-line reason. Any complete answer
// passes; no option is marked right. The answer is saved for the debrief. It has no hint,
// so it uses the full width and shows Give up next to Submit.

interface DilemmaView {
  content: { scenario: string; options: string[] };
}

// The server accepts up to 300 characters.
const REASON_MAX = 300;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function EthicalDilemma({ task, view, giveUp }: TaskPlayProps) {
  const { content } = view as DilemmaView;
  const [choice, setChoice] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const { submit, feedback, busy } = useTaskSubmit(task.id);
  const complete = choice !== null && reason.trim() !== '';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (choice === null) return;
    await submit({ choice, reason: reason.trim() });
  }

  return (
    <Card className="px-5 py-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
        <p className="text-lg leading-snug">{content.scenario}</p>
        <fieldset>
          <legend className="mb-1 text-lg font-bold">Choose one action.</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {content.options.map((option, i) => {
              const picked = choice === i;
              return (
                <label
                  key={i}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-1.5 text-lg leading-snug has-focus-visible:ring-2 has-focus-visible:ring-brand ${
                    picked
                      ? 'border-brand bg-brand/20'
                      : 'border-line bg-card-raised hover:border-brand/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="dilemma-choice"
                    className="sr-only"
                    checked={picked}
                    onChange={() => setChoice(i)}
                  />
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
                      picked ? 'bg-brand text-ink' : 'bg-card text-ink-muted'
                    }`}
                    aria-hidden
                  >
                    {LETTERS[i]}
                  </span>
                  <span>{option}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1">
          <label htmlFor="dilemma-reason" className="flex justify-between text-lg font-bold">
            Your reason, in one line
            <span className="nums font-normal text-ink-muted">
              {reason.length}/{REASON_MAX}
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="dilemma-reason"
              aria-label="Your reason"
              value={reason}
              maxLength={REASON_MAX}
              autoComplete="off"
              onChange={(e) => setReason(e.target.value)}
              className="h-12 min-w-0 flex-1 rounded-xl border-2 border-line bg-page px-3 text-xl focus:border-brand focus:outline-none"
            />
            <Button
              type="submit"
              tone="success"
              className="h-12 shrink-0 px-6 py-0 text-xl"
              disabled={!complete || busy}
            >
              Submit answer
            </Button>
            {giveUp}
          </div>
        </div>
        <SubmitFeedback feedback={feedback?.tone === 'bad' ? feedback : null} />
      </form>
    </Card>
  );
}
