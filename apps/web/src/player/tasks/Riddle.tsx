import { useState, type FormEvent } from 'react';
import { CheckCircle2, Lightbulb } from 'lucide-react';
import { Button, Card } from '../ui/basics';
import { SubmitFeedback, useTaskSubmit } from './parts';
import type { TaskPlayProps } from './TaskShell';

// Riddle: 3 riddles, each answered and checked on its own. The server accepts small
// differences (case, spaces, "a", "an", "the") and a list of answers per riddle.

interface RiddleView {
  content: { riddles: string[] };
  // The answer the team typed for each solved riddle, or null.
  answers: (string | null)[];
  hint: { index: number; text: string } | null;
}

export function Riddle({ task, view }: TaskPlayProps) {
  const { content, answers, hint } = view as RiddleView;
  const [typed, setTyped] = useState<string[]>(() => content.riddles.map(() => ''));
  // Which riddle the last feedback belongs to.
  const [checked, setChecked] = useState<number | null>(null);
  const { submit, feedback, busy } = useTaskSubmit(task.id);

  async function onCheck(e: FormEvent, index: number) {
    e.preventDefault();
    setChecked(index);
    await submit({ index, answer: typed[index] ?? '' });
  }

  return (
    <Card className="p-4">
      <p className="font-semibold">Answer all 3 riddles.</p>
      <ol className="mt-2 space-y-2.5">
        {content.riddles.map((riddle, i) => {
          const solved = answers[i] ?? null;
          return (
            <li
              key={i}
              className={`rounded-xl border px-3 py-2.5 ${
                solved ? 'border-success/50 bg-success/10' : 'border-line bg-card-raised'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/20 text-lg font-extrabold text-warning">
                  {i + 1}
                </span>
                <p className="flex-1 text-xl leading-snug">{riddle}</p>
              </div>
              {hint?.index === i && !solved && (
                <p className="mt-1.5 ml-11 flex items-center gap-2 text-lg font-semibold text-info">
                  <Lightbulb className="h-5 w-5 shrink-0" aria-hidden /> Hint: {hint.text}
                </p>
              )}
              {solved ? (
                <p className="mt-1.5 ml-11 flex items-center gap-2 text-xl font-bold text-success">
                  <CheckCircle2 className="h-6 w-6" aria-hidden /> {solved}
                </p>
              ) : (
                <form onSubmit={(e) => onCheck(e, i)} className="mt-2 ml-11 flex gap-2">
                  <input
                    aria-label={`Answer to riddle ${i + 1}`}
                    value={typed[i] ?? ''}
                    maxLength={200}
                    autoComplete="off"
                    onChange={(e) =>
                      setTyped((t) => t.map((v, j) => (j === i ? e.target.value : v)))
                    }
                    className="min-w-0 flex-1 rounded-xl border-2 border-line bg-page px-3 py-1.5 text-xl focus:border-brand focus:outline-none"
                  />
                  <Button
                    type="submit"
                    tone="success"
                    className="px-6 text-xl"
                    disabled={busy || (typed[i] ?? '').trim() === ''}
                  >
                    Check
                  </Button>
                </form>
              )}
              {checked === i && !solved && (
                <div className="mt-2 ml-11">
                  <SubmitFeedback feedback={feedback} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
