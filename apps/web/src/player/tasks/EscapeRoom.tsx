import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, Lightbulb, Lock, MessagesSquare, XCircle } from 'lucide-react';
import { useGame } from '../GameContext';
import { shortLengthAdjective } from '../rules';
import { Button, Card } from '../ui/basics';
import { LockoutBanner, useLockLeft, useTaskSubmit } from './parts';
import type { TaskPlayProps } from './TaskShell';

// Escape Room: 4 linked stages. The server sends each stage only after it has checked the one
// before, so later stages are not in the browser. Wrong answers count toward the code lockout
// (the same setting as The Vault). Chat opens the shared chat; the timer keeps running.

interface Stage {
  title: string;
  prompt: string;
  imageUrl?: string;
  // Shown flipped, as in a mirror.
  mirrorText?: string;
}

interface EscapeView {
  intro: string;
  // Cleared stages and the current one.
  stages: Stage[];
  total: number;
  // Index of the current stage.
  stage: number;
  hint: { stage: number; text: string } | null;
}

export function EscapeRoom({ task, running, view, hint: hintControl, giveUp }: TaskPlayProps) {
  const { intro, stages, total, stage, hint } = view as EscapeView;
  const { state, go } = useGame();
  const { lockoutAttempts } = state.settings.tasks;
  const triesLeft = Math.max(0, lockoutAttempts - running.wrongCount);
  const [answer, setAnswer] = useState('');
  const { submit, feedback, busy } = useTaskSubmit(task.id);
  const locked = useLockLeft(running) > 0;
  const current = stages[stage];

  async function onCheck(e: FormEvent) {
    e.preventDefault();
    const ack = await submit({ answer });
    const status = ack.ok ? (ack.value as { status?: string } | undefined)?.status : undefined;
    if (status === 'correct' || status === 'solved') setAnswer('');
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-base leading-snug font-semibold">{intro}</p>
        <Button
          tone="brand"
          variant="outline"
          className="h-11 shrink-0 py-0"
          onClick={() => go({ tab: 'chat' })}
        >
          <MessagesSquare className="h-5 w-5" aria-hidden /> Chat
        </Button>
        {hintControl}
        {giveUp}
      </div>

      {/* Stage tracker: titles of the stages reached so far; later ones stay closed. */}
      <ol className="mt-2.5 grid grid-cols-4 gap-2" aria-label="Stages">
        {Array.from({ length: total }, (_, i) => {
          const done = i < stage;
          const now = i === stage;
          return (
            <li
              key={i}
              aria-current={now ? 'step' : undefined}
              className={`flex items-center gap-1.5 rounded-xl border px-2 py-0.5 text-base leading-tight font-bold ${
                done
                  ? 'border-success/50 bg-success/15 text-success'
                  : now
                    ? 'border-warning bg-warning/15 text-warning'
                    : 'border-line text-ink-muted'
              }`}
            >
              {done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
              ) : !now ? (
                <Lock className="h-4 w-4 shrink-0" aria-hidden />
              ) : null}
              <span className="min-w-0 truncate">{stages[i]?.title ?? `Stage ${i + 1}`}</span>
            </li>
          );
        })}
      </ol>

      {current && (
        <form onSubmit={onCheck} className="mt-2.5 flex flex-col gap-2">
          <h2 className="text-xl font-extrabold">
            Stage <span className="nums">{stage + 1}</span> of <span className="nums">{total}</span>
            : {current.title}
          </h2>
          <p className="text-xl leading-snug">{current.prompt}</p>
          {current.imageUrl && (
            <img src={current.imageUrl} alt="" className="max-h-40 self-start rounded-lg" />
          )}
          {current.mirrorText && <MirrorText text={current.mirrorText} />}
          {hint?.stage === stage && (
            <p className="flex items-center gap-2 text-lg font-semibold text-info">
              <Lightbulb className="h-5 w-5 shrink-0" aria-hidden /> Hint: {hint.text}
            </p>
          )}
          <div className="flex gap-2">
            <input
              aria-label="Answer"
              value={answer}
              maxLength={200}
              autoComplete="off"
              disabled={locked}
              onChange={(e) => setAnswer(e.target.value)}
              className="h-12 min-w-0 flex-1 rounded-xl border-2 border-line bg-page px-4 text-2xl focus:border-brand focus:outline-none disabled:opacity-50"
            />
            <Button
              type="submit"
              tone="success"
              className="h-12 px-6 py-0 text-2xl"
              disabled={locked || busy || answer.trim() === ''}
            >
              Check
            </Button>
          </div>
          {/* One line: tries left, and what the last answer did. The lock banner replaces it. */}
          {locked ? (
            <LockoutBanner running={running} />
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <p className="flex items-center gap-2 text-lg text-ink-muted">
                <Lock className="h-5 w-5 shrink-0" aria-hidden />
                <span>
                  <strong className="nums text-ink">{triesLeft}</strong> of {lockoutAttempts} tries
                  left before a {shortLengthAdjective(running.nextLockSeconds)} lock.
                </span>
              </p>
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
                  {feedback.tone === 'good' ? 'Stage cleared.' : feedback.text}
                </p>
              )}
            </div>
          )}
        </form>
      )}
    </Card>
  );
}

// Mirror text is drawn flipped on a canvas, so it cannot be selected or copied as text.
function MirrorText({ text }: { text: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx) return;
    const scale = window.devicePixelRatio || 1;
    const fontPx = 28;
    const font = `800 ${fontPx}px ui-monospace, "Cascadia Mono", Consolas, monospace`;
    ctx.font = font;
    // Wrap into lines that fit the box.
    const maxWidth = canvas.clientWidth - 32;
    const lines: string[] = [];
    for (const word of text.split(/\s+/)) {
      const last = lines[lines.length - 1];
      if (last !== undefined && ctx.measureText(`${last} ${word}`).width <= maxWidth) {
        lines[lines.length - 1] = `${last} ${word}`;
      } else lines.push(word);
    }
    const lineHeight = fontPx * 1.3;
    const height = Math.ceil(lines.length * lineHeight + 12);
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(canvas.clientWidth * scale);
    canvas.height = Math.round(height * scale);
    ctx.setTransform(-scale, 0, 0, scale, canvas.width, 0);
    ctx.font = font;
    ctx.fillStyle = '#fbbf24';
    ctx.textBaseline = 'middle';
    lines.forEach((line, i) => ctx.fillText(line, 16, 6 + lineHeight * (i + 0.5)));
  }, [text]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Mirror text"
      className="w-full rounded-xl border-2 border-warning/50 bg-[#0b1220] select-none"
      style={{ height: 48 }}
    />
  );
}
