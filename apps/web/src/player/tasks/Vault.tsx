import { useState, type FormEvent } from 'react';
import { Lightbulb } from 'lucide-react';
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
    <Card>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <p className="text-xl font-semibold">{content.intro}</p>
        <ol className="space-y-2">
          {content.clues.map((clue, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-xl border border-line bg-card-raised px-4 py-2"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/20 text-lg font-extrabold text-warning">
                {i + 1}
              </span>
              {clue.imageUrl && (
                <img src={clue.imageUrl} alt="" className="h-16 rounded-lg object-contain" />
              )}
              <p className="flex-1 text-xl">{clue.text}</p>
              {hint?.position === i && (
                <span className="flex items-center gap-1 text-lg font-bold text-info">
                  <Lightbulb className="h-5 w-5" aria-hidden /> Hint: {hint.digit}
                </span>
              )}
            </li>
          ))}
        </ol>
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
  );
}
