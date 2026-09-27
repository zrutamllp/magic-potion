import { useState, type FormEvent } from 'react';
import { KeyRound, Lightbulb } from 'lucide-react';
import { Button, Card } from '../ui/basics';
import { DigitBoxes } from './DigitBoxes';
import { LockoutBanner, SubmitFeedback, useLockLeft, useTaskSubmit } from './parts';
import type { TaskPlayProps } from './TaskShell';

// The Vault: 3 clues give 3 digits of a 6-digit code. Facts only: the screen does not say
// where the other digits come from (GAME_RULES section 16).

interface VaultView {
  content: { intro: string; clues: { text: string; imageUrl?: string }[] };
  hint: { position: number; digit: string } | null;
}

const CODE_LENGTH = 6;

export function Vault({ task, running, view }: TaskPlayProps) {
  const { content, hint } = view as VaultView;
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(''));
  const { submit, feedback, busy } = useTaskSubmit(task.id);
  const locked = useLockLeft(running) > 0;
  // The hint digit is filled in by the game.
  const shown = digits.map((d, i) => (hint && hint.position === i ? hint.digit : d));
  const complete = shown.every((d) => /^\d$/.test(d));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await submit({ code: shown.join('') });
  }

  return (
    <>
      <Card>
        <p className="text-2xl font-semibold">{content.intro}</p>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {content.clues.map((clue, i) => (
            <li key={i} className="flex flex-col rounded-2xl border border-line bg-card-raised p-4">
              <span className="text-sm font-bold tracking-wider text-warning uppercase">
                Clue {i + 1}
              </span>
              {clue.imageUrl && (
                <img
                  src={clue.imageUrl}
                  alt=""
                  className="mt-2 max-h-32 rounded-lg object-contain"
                />
              )}
              <p className="mt-2 text-xl">{clue.text}</p>
              {hint?.position === i && (
                <p className="mt-auto flex items-center gap-2 pt-3 text-lg font-bold text-info">
                  <Lightbulb className="h-5 w-5" aria-hidden /> Hint: {hint.digit}
                </p>
              )}
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <KeyRound className="h-6 w-6 text-warning" aria-hidden /> Enter the code
          </h2>
          <DigitBoxes
            label="Digit"
            values={shown}
            locked={shown.map((_, i) => hint?.position === i)}
            captions={['Clue 1', 'Clue 2', 'Clue 3']}
            gapAfter={[2]}
            onChange={setDigits}
            disabled={locked}
          />
          <LockoutBanner running={running} />
          <SubmitFeedback feedback={feedback} />
          <Button
            type="submit"
            tone="success"
            className="py-3 text-2xl"
            disabled={!complete || locked || busy}
          >
            Open the vault
          </Button>
        </form>
      </Card>
    </>
  );
}
