import { ArrowRight, CheckCircle2, Clock, Gem, XCircle } from 'lucide-react';
import type { PlayerState, PlayerTaskView } from '@magic-potion/shared';
import { formatMs, money } from '../../lib/time';
import { useGame } from '../GameContext';
import { TASK_LOOK } from '../tasks';
import { Card, Chip, PageTitle, TONE_BG, TONE_TEXT, type Tone } from '../ui/basics';

// Home: the team's 5 tasks and its Found items. Every task is worth the same points.

export const STATUS: Record<PlayerTaskView['status'], { label: string; tone: Tone }> = {
  NOT_STARTED: { label: 'Not started', tone: 'muted' },
  IN_PROGRESS: { label: 'In progress', tone: 'info' },
  DONE: { label: 'Done', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
};

// Why a task cannot be started right now, or null if it can.
export function startBlock(state: PlayerState, task: PlayerTaskView): string | null {
  if (task.status === 'DONE' || task.running) return null;
  if (state.team.tasks.some((t) => t.running && t.id !== task.id)) {
    return 'Another task is open. Finish it first.';
  }
  if (state.team.taskFunds < 0) {
    return 'Your Task Funds are below zero. You cannot start a task.';
  }
  return null;
}

export function Home() {
  const { state } = useGame();
  const { tasks, tasksDone, foundItems } = state.team;
  return (
    <>
      <PageTitle
        title="Your tasks"
        subtitle={`${tasksDone} of ${tasks.length} done`}
        right={
          <span className="flex items-center gap-2 text-lg text-ink-muted">
            <Clock className="h-5 w-5" aria-hidden /> One task open at a time
          </span>
        }
      />
      {foundItems.length > 0 && (
        <section
          aria-label="Found items"
          className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-warning/40 bg-warning/5 px-4 py-2.5"
        >
          <h2 className="text-sm font-bold tracking-wider text-ink-muted uppercase">Found items</h2>
          {foundItems.map((value) => (
            <span
              key={value}
              className="nums flex items-center gap-2 rounded-xl border border-warning/50 bg-warning/10 px-3 py-1 text-xl font-extrabold tracking-wide"
            >
              <Gem className="h-5 w-5 text-warning" aria-hidden />
              Fragment: {value}
            </span>
          ))}
        </section>
      )}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </>
  );
}

function TaskCard({ task }: { task: PlayerTaskView }) {
  const { state, go, timerMsLeft } = useGame();
  const look = TASK_LOOK[task.key];
  const Icon = look.icon;
  const status = STATUS[task.running ? 'IN_PROGRESS' : task.status];
  const blocked = startBlock(state, task);
  const done = task.status === 'DONE';

  return (
    <button
      onClick={() => go({ tab: 'task', taskId: task.id })}
      className="text-left"
      aria-label={`${task.name}: ${status.label}`}
    >
      <Card
        tone={
          task.running ? 'info' : done ? 'success' : task.status === 'FAILED' ? 'danger' : look.tone
        }
        className={`flex h-full flex-col transition hover:-translate-y-0.5 hover:bg-card-raised ${
          task.running ? 'ring-2 ring-info/60' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-xl ${TONE_BG[look.tone]} ${TONE_TEXT[look.tone]}`}
          >
            <Icon className="h-8 w-8" aria-hidden />
          </span>
          <div className="flex flex-col items-end gap-2">
            <Chip tone={task.type === 'COMMON' ? 'brand' : 'info'}>
              {task.type === 'COMMON' ? 'Common' : 'Unique'}
            </Chip>
            <Chip tone="muted">
              <Clock className="h-4 w-4" aria-hidden /> {Math.round(task.timerSeconds / 60)} min
            </Chip>
          </div>
        </div>
        <h3 className="mt-4 text-2xl font-bold">{task.name}</h3>
        <p className="mt-1 text-lg text-ink-muted">{look.summary}</p>

        <div className="mt-4 flex items-center gap-2 text-lg font-bold">
          {done ? (
            <CheckCircle2 className="h-6 w-6 text-success" aria-hidden />
          ) : task.status === 'FAILED' && !task.running ? (
            <XCircle className="h-6 w-6 text-danger" aria-hidden />
          ) : null}
          <span className={TONE_TEXT[status.tone]}>{status.label}</span>
          {task.running && (
            <span className="nums ml-auto text-3xl font-extrabold text-info">
              {formatMs(timerMsLeft(task.running.msLeft))}
            </span>
          )}
        </div>
        {blocked && <p className="mt-2 text-base text-warning">{blocked}</p>}

        <div className="mt-auto flex items-center justify-between pt-5">
          <span className="text-xl font-bold text-warning">{money(task.points)} points</span>
          <ArrowRight className="h-6 w-6 text-ink-muted" aria-hidden />
        </div>
      </Card>
    </button>
  );
}
