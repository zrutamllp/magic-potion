import { useState } from 'react';
import { CheckCircle2, Flag, Lightbulb, Lock, XCircle } from 'lucide-react';
import {
  LOCKOUT_TASK_KEYS,
  NO_HINT_TASK_KEYS,
  type Ack,
  type PlayerState,
  type PlayerTaskView,
} from '@magic-potion/shared';
import { formatMs, money } from '../../lib/time';
import { useGame } from '../GameContext';
import { shortLengthAdjective } from '../rules';
import { Button, Card } from '../ui/basics';

// Pieces shared by every task screen: submit feedback, the hint card, tries and lockout,
// and Give up. Player text states facts only (GAME_RULES section 16).

export type Running = NonNullable<PlayerTaskView['running']>;

export interface Feedback {
  tone: 'good' | 'bad';
  text: string;
}

// What the server said about a submission, in plain words.
export function feedbackFor(ack: Ack): Feedback {
  if (!ack.ok) return { tone: 'bad', text: ack.message };
  const status = (ack.value as { status?: string } | undefined)?.status;
  switch (status) {
    case 'correct':
      return { tone: 'good', text: 'Correct! Keep going.' };
    case 'solved':
      return { tone: 'good', text: 'Solved!' };
    case 'failed':
      return { tone: 'bad', text: 'The task failed.' };
    default:
      return { tone: 'bad', text: 'Not right. Try again.' };
  }
}

// Sends a submission for the open task and keeps the answer on screen.
export function useTaskSubmit(taskId: string) {
  const { send } = useGame();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(submission: unknown): Promise<Ack> {
    setBusy(true);
    const ack = await send('task:submit', { taskId, submission }).catch((): Ack => ({
      ok: false,
      message: 'Something went wrong. Please try again.',
    }));
    setBusy(false);
    setFeedback(feedbackFor(ack));
    return ack;
  }
  return { submit, feedback, busy, clearFeedback: () => setFeedback(null) };
}

export function SubmitFeedback({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  const good = feedback.tone === 'good';
  const Icon = good ? CheckCircle2 : XCircle;
  return (
    <p
      role="status"
      className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xl font-bold ${
        good
          ? 'border-success/50 bg-success/15 text-success'
          : 'border-danger/60 bg-danger/15 text-danger'
      }`}
    >
      <Icon className="h-6 w-6 shrink-0" aria-hidden />
      {feedback.text}
    </p>
  );
}

export function hasLockout(task: PlayerTaskView): boolean {
  return LOCKOUT_TASK_KEYS.includes(task.key);
}

export function hasHint(task: PlayerTaskView): boolean {
  return !NO_HINT_TASK_KEYS.includes(task.key);
}

// How a hint would be paid right now: Support Funds first, the rest from Task Funds.
export function hintSplit(state: PlayerState) {
  const cost = state.settings.tasks.hintCost;
  const fromSupport = Math.min(Math.max(state.team.supportFunds, 0), cost);
  const fromTask = cost - fromSupport;
  return { cost, fromSupport, fromTask, blocked: state.team.taskFunds - fromTask < 0 };
}

// ms left on a code lockout, counting down on screen.
export function useLockLeft(running: Running): number {
  const { timerMsLeft } = useGame();
  return running.lockMsLeft > 0 ? timerMsLeft(running.lockMsLeft) : 0;
}

export function LockoutBanner({ running }: { running: Running }) {
  const left = useLockLeft(running);
  if (left <= 0) return null;
  return (
    <p
      role="alert"
      className="flex items-center gap-3 rounded-xl border border-danger/60 bg-danger/15 px-4 py-3 text-xl font-bold text-danger"
    >
      <Lock className="h-6 w-6 shrink-0" aria-hidden />
      <span>
        Locked after too many wrong tries. Try again in{' '}
        <span className="nums">{formatMs(left)}</span>
      </span>
    </p>
  );
}

export function HintCard({ task, running }: { task: PlayerTaskView; running: Running }) {
  const { state, act, send } = useGame();
  const [confirming, setConfirming] = useState(false);
  const perTry = state.settings.tasks.hintsPerAttempt;

  if (!hasHint(task)) {
    return (
      <Card>
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Lightbulb className="h-6 w-6 text-ink-muted" aria-hidden /> Hint
        </h2>
        <p className="mt-2 text-lg text-ink-muted">This task has no hint.</p>
      </Card>
    );
  }

  const used = running.hintsUsed >= perTry;
  const { cost, fromSupport, fromTask, blocked } = hintSplit(state);
  const paid =
    fromTask === 0
      ? `${money(cost)} from Support Funds`
      : fromSupport === 0
        ? `${money(cost)} from Task Funds`
        : `${money(fromSupport)} from Support Funds and ${money(fromTask)} from Task Funds`;

  return (
    <Card tone={used ? 'muted' : 'info'}>
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <Lightbulb className="h-6 w-6 text-info" aria-hidden /> Hint
      </h2>
      {used ? (
        <p className="mt-2 text-lg font-semibold text-info">Hint used. It is shown in the task.</p>
      ) : (
        <>
          <p className="mt-2 text-lg">
            Costs <strong>{money(cost)}</strong>. Paid now: {paid}.
          </p>
          {blocked ? (
            <p className="mt-2 text-lg text-warning">
              A hint would take your Task Funds below zero.
            </p>
          ) : confirming ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                tone="brand"
                onClick={async () => {
                  setConfirming(false);
                  await act(null, () => send('task:hint', { taskId: task.id }));
                }}
              >
                Yes, use hint
              </Button>
              <Button tone="muted" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              className="mt-3 w-full"
              tone="brand"
              variant="outline"
              onClick={() => setConfirming(true)}
            >
              <Lightbulb className="h-5 w-5" aria-hidden /> Use hint
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

export function TriesCard({ task, running }: { task: PlayerTaskView; running: Running }) {
  const { state } = useGame();
  const left = useLockLeft(running);
  if (!hasLockout(task)) return null;
  const { lockoutAttempts } = state.settings.tasks;
  const triesLeft = Math.max(0, lockoutAttempts - running.wrongCount);
  return (
    <Card tone={left > 0 ? 'danger' : 'muted'}>
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <Lock className="h-6 w-6 text-ink-muted" aria-hidden /> Wrong tries
      </h2>
      <p className="mt-2 text-lg">
        {left > 0 ? (
          <>
            Locked for <span className="nums font-bold">{formatMs(left)}</span>
          </>
        ) : (
          <>
            <strong className="nums">{triesLeft}</strong> of {lockoutAttempts} tries left before a{' '}
            {shortLengthAdjective(running.nextLockSeconds)} lock.
          </>
        )}
      </p>
    </Card>
  );
}

export function GiveUpCard({ task }: { task: PlayerTaskView }) {
  const { state, act, send } = useGame();
  const [confirming, setConfirming] = useState(false);
  const penalty = money(state.settings.tasks.failPenalty);
  return (
    <Card tone="danger">
      <p className="text-lg">Give up counts as a fail: −{penalty} Task Funds.</p>
      {confirming ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            tone="danger"
            onClick={async () => {
              setConfirming(false);
              await act(null, () => send('task:giveUp', { taskId: task.id }));
            }}
          >
            Yes, give up
          </Button>
          <Button tone="muted" onClick={() => setConfirming(false)}>
            Keep going
          </Button>
        </div>
      ) : (
        <Button
          className="mt-3 w-full"
          tone="danger"
          variant="outline"
          onClick={() => setConfirming(true)}
        >
          <Flag className="h-5 w-5" aria-hidden /> Give up
        </Button>
      )}
    </Card>
  );
}

// Give up as one button, for full-width tasks. Same facts as the card, shown when asked.
export function GiveUpInline({ task }: { task: PlayerTaskView }) {
  const { state, act, send } = useGame();
  const [confirming, setConfirming] = useState(false);
  const penalty = money(state.settings.tasks.failPenalty);
  if (!confirming) {
    return (
      <Button
        tone="danger"
        variant="outline"
        className="h-12 shrink-0 py-0"
        onClick={() => setConfirming(true)}
      >
        <Flag className="h-5 w-5" aria-hidden /> Give up
      </Button>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-lg text-danger">−{penalty} Task Funds.</span>
      <Button
        tone="danger"
        className="h-12 py-0"
        onClick={async () => {
          setConfirming(false);
          await act(null, () => send('task:giveUp', { taskId: task.id }));
        }}
      >
        Yes, give up
      </Button>
      <Button tone="muted" className="h-12 py-0" onClick={() => setConfirming(false)}>
        Keep going
      </Button>
    </div>
  );
}
