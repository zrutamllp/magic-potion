import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Flag, Hourglass, Play } from 'lucide-react';
import { formatMs, money } from '../../lib/time';
import { useGame } from '../GameContext';
import { TASK_LOOK } from '../tasks';
import { Button, Card, Chip, TONE_BG, TONE_TEXT } from '../ui/basics';
import { startBlock } from './Home';

// One task. The shell is real (Start Task, the server timer, Exit, Give up); the puzzle
// itself arrives in Phase 5, so a placeholder stands in for it.

export function TaskScreen({ taskId }: { taskId: string }) {
  const { state, go, act, send, timerMsLeft } = useGame();
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const task = state.team.tasks.find((t) => t.id === taskId);

  if (!task) {
    return (
      <Card>
        <p className="text-xl">That task was not found.</p>
        <Button className="mt-4" onClick={() => go({ tab: 'home' })}>
          Back to Home
        </Button>
      </Card>
    );
  }

  const look = TASK_LOOK[task.key];
  const Icon = look.icon;
  const blocked = startBlock(state, task);
  const running = task.running;
  const penalty = money(state.settings.tasks.failPenalty);

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-5">
        <span
          className={`flex h-16 w-16 items-center justify-center rounded-2xl ${TONE_BG[look.tone]} ${TONE_TEXT[look.tone]}`}
        >
          <Icon className="h-9 w-9" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={task.type === 'COMMON' ? 'brand' : 'info'}>
              {task.type === 'COMMON' ? 'Common' : 'Unique'}
            </Chip>
            <Chip tone="warning">{money(task.points)} points</Chip>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold">{task.name}</h1>
          <p className="text-lg text-ink-muted">{look.summary}</p>
        </div>
        {running && (
          <div className="text-right leading-tight">
            <span className="text-sm font-bold tracking-wider text-ink-muted uppercase">
              Task timer
            </span>
            <p className="nums text-5xl font-extrabold text-info" aria-label="Task time left">
              {formatMs(timerMsLeft(running.msLeft))}
            </p>
          </div>
        )}
        <Button tone="muted" variant="outline" onClick={() => go({ tab: 'home' })}>
          <ArrowLeft className="h-5 w-5" aria-hidden /> Exit
        </Button>
      </Card>

      {task.status === 'DONE' ? (
        <Card tone="success" className="flex items-center gap-4">
          <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
          <p className="text-2xl font-bold">Solved. {money(task.points)} points.</p>
        </Card>
      ) : running ? (
        <>
          <Card className="py-14 text-center">
            <Hourglass className="mx-auto h-14 w-14 text-ink-muted" aria-hidden />
            <p className="mt-4 text-2xl font-bold">
              The puzzle for this task arrives in the next update.
            </p>
            <p className="mt-2 text-lg text-ink-muted">
              The timer is running. Exit keeps it running.
            </p>
          </Card>
          <Card tone="danger" className="flex flex-wrap items-center gap-4">
            <p className="flex-1 text-lg">
              Give up counts as a fail and costs {penalty} Task Funds.
            </p>
            {confirmGiveUp ? (
              <div className="flex gap-3">
                <Button
                  tone="danger"
                  onClick={async () => {
                    setConfirmGiveUp(false);
                    await act('You gave up this task.', () => send('task:giveUp', { taskId }));
                  }}
                >
                  Yes, give up
                </Button>
                <Button tone="muted" onClick={() => setConfirmGiveUp(false)}>
                  Keep going
                </Button>
              </div>
            ) : (
              <Button tone="danger" variant="outline" onClick={() => setConfirmGiveUp(true)}>
                <Flag className="h-5 w-5" aria-hidden /> Give up
              </Button>
            )}
          </Card>
        </>
      ) : (
        <Card className="text-center">
          {task.status === 'FAILED' && (
            <p className="mb-4 text-xl text-danger">
              This task failed. You can try again with a new timer.
            </p>
          )}
          <p className="text-xl">
            Timer: <strong>{Math.round(task.timerSeconds / 60)} minutes</strong>. It starts when you
            press Start Task.
          </p>
          {blocked && <p className="mt-3 text-lg text-warning">{blocked}</p>}
          <Button
            className="mt-6 px-10 py-4 text-2xl"
            tone="success"
            disabled={Boolean(blocked) || !state.game.timersRunning}
            onClick={() =>
              act('Task started. The timer is running.', () => send('task:start', { taskId }))
            }
          >
            <Play className="h-6 w-6" aria-hidden /> Start Task
          </Button>
        </Card>
      )}
    </div>
  );
}
