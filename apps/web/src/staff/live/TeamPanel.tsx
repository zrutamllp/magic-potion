import { useState } from 'react';
import { Eye, KeyRound, Pencil, UserMinus, Wallet, X } from 'lucide-react';
import { TASKS_PER_TEAM, type StaffTaskView, type StaffTeamView } from '@magic-potion/shared';
import { formatMs, money, msLeft } from '../../lib/time';
import { SmallButton, Status } from '../ui';
import { useLiveView } from './context';
import {
  AdjustDialog,
  ConfirmPost,
  RemoveTeamDialog,
  RenameDialog,
  ResetLoginDialog,
} from './dialogs';
import { ago, duration } from './format';
import { DevTools } from './DevTools';
import { TeamPhoto } from './photos';
import { taskLocked } from './TeamTable';

// Everything about one team, and the actions staff may take on it (GAME_RULES section 11).
// The server checks every permission again.

type Open =
  | { kind: 'adjust' | 'rename' | 'reset' | 'remove' }
  | { kind: 'clear' | 'stop'; task: StaffTaskView }
  | { kind: 'release'; fragmentId: string; holder: string; label: string };

const STATUS_TEXT = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  FAILED: 'Failed',
} as const;

const FRAGMENT_LABEL = { VAULT: 'Vault fragment', FIND_CODE: 'Find the Code fragment' };

export function TeamPanel({ team, onClose }: { team: StaffTeamView; onClose: () => void }) {
  const { state, receivedAt, now, serverNow, isAdmin, viewAsTeam } = useLiveView();
  const [open, setOpen] = useState<Open | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const removed = team.status === 'REMOVED';
  const live = !removed && state.game.phase !== 'LOBBY' && !state.game.ended;
  const close = () => setOpen(null);

  return (
    <aside
      aria-label={`Team ${team.name}`}
      className="fixed inset-y-0 right-0 z-40 flex w-[440px] flex-col border-l border-line bg-sidebar shadow-2xl"
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-2xl font-extrabold">{team.name}</h2>
          <p className="text-sm text-ink-muted">
            Code <span className="font-mono">{team.code}</span> ·{' '}
            {team.online ? 'Online' : 'Offline'} · Last action {ago(team.lastActivityAt, serverNow)}
            {removed && ' · Removed'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-ink-muted hover:bg-card-raised hover:text-ink"
          aria-label="Close team panel"
        >
          <X className="h-6 w-6" aria-hidden />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {team.stuck.length > 0 && (
          <p className="rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-sm">
            <strong className="text-danger">Stuck: </strong>
            {team.stuck
              .map((r) =>
                r === 'NEGATIVE_FUNDS'
                  ? 'Task Funds are below zero, so the team cannot start a task.'
                  : `No action for ${duration(state.limits.stuckIdleSeconds)} or more.`,
              )
              .join(' ')}
          </p>
        )}
        <dl className="grid grid-cols-4 gap-2 text-center">
          <Stat label="Task Funds" value={money(team.taskFunds)} danger={team.taskFunds < 0} />
          <Stat label="Support" value={money(team.supportFunds)} />
          <Stat label="Tasks" value={`${team.tasksDone}/${TASKS_PER_TEAM}`} />
          <Stat label="Score" value={team.score === null ? '—' : money(team.score)} />
        </dl>
        <Status ok={notice} />

        <section>
          <h3 className="mb-1 text-sm font-bold tracking-wide text-ink-muted uppercase">Tasks</h3>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {team.tasks.map((task) => {
              const locked = taskLocked(task);
              const left = task.running
                ? msLeft(task.running.msLeft, receivedAt, state.game.timersRunning, now)
                : null;
              return (
                <li key={task.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{task.name}</p>
                    <p className="text-sm text-ink-muted">
                      {task.type === 'COMMON' ? 'Common' : 'Unique'} ·{' '}
                      {locked ? 'Locked' : STATUS_TEXT[task.status]}
                      {task.running && ` · try ${task.running.number}`}
                      {left !== null && ` · ${formatMs(left)} left`}
                    </p>
                  </div>
                  {isAdmin && live && task.running && (
                    <div className="flex shrink-0 gap-1">
                      {locked && (
                        <SmallButton
                          variant="outline"
                          className="px-2 py-0.5 text-sm"
                          onClick={() => setOpen({ kind: 'clear', task })}
                        >
                          Clear lock
                        </SmallButton>
                      )}
                      <SmallButton
                        variant="outline"
                        tone="danger"
                        className="px-2 py-0.5 text-sm"
                        onClick={() => setOpen({ kind: 'stop', task })}
                      >
                        Stop try
                      </SmallButton>
                    </div>
                  )}
                </li>
              );
            })}
            {team.tasks.length === 0 && (
              <li className="px-3 py-2 text-sm text-ink-muted">Tasks are drawn at the start.</li>
            )}
          </ul>
        </section>

        {team.neededFragments.length > 0 && (
          <section>
            <h3 className="mb-1 text-sm font-bold tracking-wide text-ink-muted uppercase">
              Fragments this team needs
            </h3>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {team.neededFragments.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div>
                    <p className="font-semibold">{FRAGMENT_LABEL[f.kind]}</p>
                    <p className="text-sm text-ink-muted">
                      Held by {f.holderTeamName} ({f.holderOnline ? 'online' : 'offline'})
                    </p>
                  </div>
                  {f.released ? (
                    <span className="text-sm text-success">Released</span>
                  ) : (
                    !removed &&
                    !state.game.ended && (
                      <SmallButton
                        variant="outline"
                        className="px-2 py-0.5 text-sm"
                        onClick={() =>
                          setOpen({
                            kind: 'release',
                            fragmentId: f.id,
                            holder: f.holderTeamName,
                            label: FRAGMENT_LABEL[f.kind],
                          })
                        }
                      >
                        Release
                      </SmallButton>
                    )
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        <DevTools team={team} />
        <section>
          <h3 className="mb-1 text-sm font-bold tracking-wide text-ink-muted uppercase">
            Team photo
          </h3>
          <TeamPhoto team={team} />
        </section>
      </div>

      <footer className="grid grid-cols-2 gap-2 border-t border-line px-5 py-4">
        <SmallButton onClick={() => viewAsTeam(team.id)} variant="outline">
          <Eye className="h-4 w-4" aria-hidden /> View as team
        </SmallButton>
        <SmallButton onClick={() => setOpen({ kind: 'adjust' })} disabled={!live}>
          <Wallet className="h-4 w-4" aria-hidden /> Change funds
        </SmallButton>
        <SmallButton
          variant="outline"
          tone="muted"
          onClick={() => setOpen({ kind: 'rename' })}
          disabled={removed || state.game.ended}
        >
          <Pencil className="h-4 w-4" aria-hidden /> Rename
        </SmallButton>
        <SmallButton
          variant="outline"
          tone="muted"
          onClick={() => setOpen({ kind: 'reset' })}
          disabled={removed}
        >
          <KeyRound className="h-4 w-4" aria-hidden /> Reset login
        </SmallButton>
        {isAdmin && (
          <SmallButton
            variant="outline"
            tone="danger"
            onClick={() => setOpen({ kind: 'remove' })}
            disabled={!live || state.game.phase === 'REVEAL'}
            className="col-span-2"
          >
            <UserMinus className="h-4 w-4" aria-hidden /> Remove from game
          </SmallButton>
        )}
      </footer>

      {open?.kind === 'adjust' && (
        <AdjustDialog
          team={team}
          onClose={close}
          onDone={(text) => {
            setNotice(text);
            close();
          }}
        />
      )}
      {open?.kind === 'rename' && <RenameDialog team={team} onClose={close} />}
      {open?.kind === 'reset' && <ResetLoginDialog team={team} onClose={close} />}
      {open?.kind === 'remove' && <RemoveTeamDialog team={team} onClose={close} />}
      {open?.kind === 'clear' && (
        <ConfirmPost
          title={`Clear the lock on ${open.task.name}?`}
          body="The team can enter a code again at once. Earlier locks still count toward the next lock length."
          path={`/teams/${team.id}/clear-lockout`}
          payload={{ taskId: open.task.id }}
          label="Clear lock"
          onClose={close}
        />
      )}
      {open?.kind === 'stop' && (
        <ConfirmPost
          title={`Stop this try of ${open.task.name}?`}
          body="The try ends with no penalty and does not count as done. The team's other tasks unlock, and it can start this task again."
          path={`/teams/${team.id}/stop-task`}
          payload={{ taskId: open.task.id }}
          label="Stop try"
          tone="danger"
          withReason
          onClose={close}
        />
      )}
      {open?.kind === 'release' && (
        <ConfirmPost
          title={`Give ${team.name} its ${open.label}?`}
          body={`It appears on ${team.name}'s Home as a Found item. Use this only when the holder (${open.holder}) is missing.`}
          path="/release-fragment"
          payload={{ fragmentId: open.fragmentId }}
          label="Release fragment"
          onClose={close}
        />
      )}
    </aside>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl bg-card px-2 py-2">
      <dt className="text-xs font-bold tracking-wide text-ink-muted uppercase">{label}</dt>
      <dd className={`nums text-lg font-extrabold ${danger ? 'text-danger' : ''}`}>{value}</dd>
    </div>
  );
}
