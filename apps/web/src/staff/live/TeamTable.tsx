import { AlertTriangle, Check, Lock, Play, X } from 'lucide-react';
import { TASKS_PER_TEAM, type StaffTaskView, type StaffTeamView } from '@magic-potion/shared';
import { formatMs, money, msLeft } from '../../lib/time';
import { useLiveView } from './context';
import { ago } from './format';

// One compact row per team, so 20 teams fit a 1366x768 laptop (Phase 6C).

const STATUS_TEXT = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  FAILED: 'Failed',
} as const;

export function taskLocked(task: StaffTaskView): boolean {
  return (task.running?.lockMsLeft ?? 0) > 0;
}

function TaskChip({ task }: { task: StaffTaskView }) {
  const { state, receivedAt, now } = useLiveView();
  const running = task.running;
  const locked = taskLocked(task);
  const left = running ? msLeft(running.msLeft, receivedAt, state.game.timersRunning, now) : null;
  const look = locked
    ? 'bg-warning/25 text-warning'
    : {
        NOT_STARTED: 'bg-card-raised text-ink-muted',
        IN_PROGRESS: 'bg-info/25 text-info',
        DONE: 'bg-success/25 text-success',
        FAILED: 'bg-danger/25 text-danger',
      }[task.status];
  const Icon = locked
    ? Lock
    : { NOT_STARTED: null, IN_PROGRESS: Play, DONE: Check, FAILED: X }[task.status];
  const label = `${task.name}: ${locked ? 'Locked' : STATUS_TEXT[task.status]}${
    left !== null ? `, ${formatMs(left)} left` : ''
  }`;
  return (
    <span
      title={label}
      aria-label={label}
      className={`flex h-6 w-6 items-center justify-center rounded-md ${look}`}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : <span className="text-xs">·</span>}
    </span>
  );
}

function StuckChip({ team }: { team: StaffTeamView }) {
  const { state } = useLiveView();
  if (team.stuck.length === 0) return null;
  const minutes = Math.round(state.limits.stuckIdleSeconds / 60);
  const why = team.stuck
    .map((r) =>
      r === 'NEGATIVE_FUNDS' ? 'Task Funds below zero' : `No action for ${minutes}+ min`,
    )
    .join(' · ');
  return (
    <span
      title={why}
      className="inline-flex items-center gap-1 rounded-full bg-danger/20 px-2 py-0.5 text-xs font-bold text-danger"
    >
      <AlertTriangle className="h-3 w-3" aria-hidden />
      Stuck<span className="sr-only">: {why}</span>
    </span>
  );
}

export function TeamTable() {
  const { state, serverNow, openTeam } = useLiveView();
  const teams = [...state.teams].sort(
    (a, b) => Number(a.status === 'REMOVED') - Number(b.status === 'REMOVED'),
  );
  if (teams.length === 0) {
    return <p className="p-4 text-ink-muted">No teams to show.</p>;
  }
  return (
    <table className="w-full text-left text-sm">
      <thead className="sticky top-0 z-10 bg-card text-xs tracking-wide text-ink-muted uppercase">
        <tr>
          <th className="px-3 py-2">Team</th>
          <th className="px-2 py-2">Tasks</th>
          <th className="px-2 py-2 text-right">Task Funds</th>
          <th className="px-2 py-2 text-right">Support</th>
          <th className="px-2 py-2 text-right" title="Chat messages left this round">
            Msgs
          </th>
          <th className="px-2 py-2">Last action</th>
          <th className="px-3 py-2 text-right">Score</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {teams.map((t) => {
          const removed = t.status === 'REMOVED';
          return (
            <tr
              key={t.id}
              onClick={() => openTeam(t.id)}
              className={`cursor-pointer hover:bg-card-raised ${removed ? 'opacity-50' : ''} ${
                t.stuck.length > 0 ? 'bg-danger/5' : ''
              }`}
            >
              <td className="px-3 py-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openTeam(t.id);
                  }}
                  className="flex items-center gap-2 text-left font-semibold hover:underline"
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.online ? 'bg-success' : 'bg-line'}`}
                    title={t.online ? 'Online' : 'Offline'}
                  />
                  <span className="max-w-44 truncate">{t.name}</span>
                </button>
                <div className="mt-0.5 flex items-center gap-2 pl-4.5">
                  {removed ? (
                    <span className="text-xs text-ink-muted">Removed</span>
                  ) : (
                    <StuckChip team={t} />
                  )}
                </div>
              </td>
              <td className="px-2 py-1.5">
                <div className="flex items-center gap-1">
                  {t.tasks.map((task) => (
                    <TaskChip key={task.id} task={task} />
                  ))}
                  <span className="nums ml-1.5 font-semibold">
                    {t.tasksDone}/{TASKS_PER_TEAM}
                  </span>
                </div>
              </td>
              <td
                className={`nums px-2 py-1.5 text-right font-semibold ${t.taskFunds < 0 ? 'text-danger' : ''}`}
              >
                {money(t.taskFunds)}
              </td>
              <td className="nums px-2 py-1.5 text-right text-ink-muted">
                {money(t.supportFunds)}
              </td>
              <td className="nums px-2 py-1.5 text-right">{t.messagesLeft}</td>
              <td className="px-2 py-1.5 whitespace-nowrap text-ink-muted">
                {ago(t.lastActivityAt, serverNow)}
              </td>
              <td className="nums px-3 py-1.5 text-right font-bold">
                {t.score === null ? '—' : money(t.score)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
