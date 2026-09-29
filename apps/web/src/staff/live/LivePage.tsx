import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, FastForward, Megaphone, Pause, Play, Plus, Square } from 'lucide-react';
import type { StaffState } from '@magic-potion/shared';
import { useDashboardLive, type LiveStatus } from '../../lib/live';
import { formatMs, msLeft, useTicker } from '../../lib/time';
import { PHASE_LABEL } from '../../player/layout/Shell';
import { useStaff } from '../StaffContext';
import { Dialog, SmallButton, Status, useAction } from '../ui';
import { LiveProvider, useLiveView, type LiveView } from './context';
import { MessageDialog } from './dialogs';
import { Feeds } from './Feeds';
import { END_PHASE_TEXT } from './format';
import { TeamPanel } from './TeamPanel';
import { TeamTable } from './TeamTable';
import { TeamViewer } from './TeamViewer';

// The live dashboard (Phase 6C): the admin runs the game from here; co-facilitators follow
// their assigned teams. Everything updates over the staff socket, with no refresh. It fits a
// 1366x768 laptop: controls on top, teams on the left, feeds on the right.

export function LivePage({ gameId }: { gameId: string }) {
  const { login, go } = useStaff();
  const live = useDashboardLive(login.token, gameId);
  const now = useTicker(1000);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const { send, status } = live;

  // "View as team": ask the server to follow the team; again after a reconnect.
  useEffect(() => {
    if (status !== 'online') return;
    void send('staff:watch', { teamId: viewing });
  }, [send, status, viewing]);

  const back = () => go({ page: 'games' });
  const snapshot = live.snapshot;
  const view = useMemo<LiveView | null>(() => {
    if (!snapshot) return null;
    const { state, receivedAt } = snapshot;
    return {
      gameId,
      state,
      receivedAt,
      now,
      serverNow: state.game.serverNow + (now - receivedAt),
      isAdmin: state.staff.role === 'MAIN_ADMIN',
      auditVersion: live.auditVersion,
      openTeam: setSelected,
      viewAsTeam: setViewing,
    };
  }, [snapshot, gameId, now, live.auditVersion]);

  const closeViewer = useCallback(() => setViewing(null), []);

  if (live.ended || live.problem) {
    return (
      <Centered onBack={back}>
        <Status error={live.ended ?? live.problem} />
      </Centered>
    );
  }
  if (!view) {
    return (
      <Centered onBack={back}>
        <p className="text-ink-muted">Connecting to the game…</p>
      </Centered>
    );
  }
  const team = view.state.teams.find((t) => t.id === selected) ?? null;
  const watched = live.watched?.teamId === viewing ? live.watched : null;
  return (
    <LiveProvider value={view}>
      <div className="flex h-screen flex-col overflow-hidden">
        <ControlBar status={live.status} onBack={back} />
        <div className="flex min-h-0 flex-1 gap-3 p-3">
          <section className="min-w-0 flex-1 overflow-auto rounded-2xl border border-line bg-card">
            <TeamTable />
          </section>
          <Feeds feed={live.feed} />
        </div>
      </div>
      {team && <TeamPanel key={team.id} team={team} onClose={() => setSelected(null)} />}
      {viewing && (
        <TeamViewer
          teamName={view.state.teams.find((t) => t.id === viewing)?.name ?? 'Team'}
          watched={watched}
          status={live.status}
          onClose={closeViewer}
        />
      )}
    </LiveProvider>
  );
}

function Centered({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  return (
    <div className="p-6">
      <BackButton onBack={onBack} />
      <div className="mt-4">{children}</div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> All games
    </button>
  );
}

function ConnectionState({ status }: { status: LiveStatus }) {
  const look = {
    online: ['bg-success', 'Live'],
    connecting: ['bg-warning', 'Connecting'],
    offline: ['bg-danger', 'Reconnecting…'],
  }[status];
  return (
    <span className="flex items-center gap-1.5 text-sm text-ink-muted">
      <span className={`h-2.5 w-2.5 rounded-full ${look[0]}`} />
      {look[1]}
    </span>
  );
}

type Confirm = 'start' | 'end' | null;

// Smaller buttons, so the whole control bar fits one line on a 1366px laptop.
const COMPACT = 'px-3 py-1 text-sm';

export function ControlBar({ status, onBack }: { status: LiveStatus; onBack: () => void }) {
  const { api } = useStaff();
  const { state, receivedAt, now, isAdmin, gameId } = useLiveView();
  const { game, potion } = state;
  const action = useAction();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [messaging, setMessaging] = useState(false);
  const left = msLeft(game.phaseMsLeft, receivedAt, !game.frozen, now);
  const timed = game.phaseMsLeft !== null && game.phase !== 'LOBBY' && game.phase !== 'REVEAL';
  const post = (path: string, body?: unknown) =>
    action.run(() => api.post(`/games/${gameId}/${path}`, body));

  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-sidebar px-4 py-2">
      <div className="min-w-0">
        <BackButton onBack={onBack} />
        <h1 className="truncate text-xl font-extrabold text-brand-soft">{game.name}</h1>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={`rounded-full px-3 py-0.5 text-sm font-bold ${
            game.frozen ? 'bg-warning/20 text-warning' : 'bg-card-raised text-ink'
          }`}
        >
          {game.ended
            ? 'Game ended'
            : game.frozen
              ? `${PHASE_LABEL[game.phase]} · Paused`
              : PHASE_LABEL[game.phase]}
        </span>
        {left !== null && (
          <span
            className={`nums text-3xl font-extrabold ${
              game.frozen ? 'text-warning' : left < 5 * 60_000 ? 'text-alert' : 'text-success'
            }`}
            aria-label="Time left in this phase"
          >
            {formatMs(left)}
          </span>
        )}
      </div>
      <div className="text-sm leading-tight">
        <p className="text-ink-muted">Potion</p>
        <p className="nums text-lg font-extrabold text-info">
          {Math.round(potion.percent)}%{' '}
          <span className="text-sm font-normal text-ink-muted">
            ({potion.completedTeams}/{potion.totalTeams} teams)
          </span>
        </p>
      </div>
      <ConnectionState status={status} />

      {isAdmin && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {game.phase === 'LOBBY' && (
            <SmallButton
              className={COMPACT}
              tone="success"
              onClick={() => setConfirm('start')}
              disabled={action.busy}
            >
              <Play className="h-4 w-4" aria-hidden /> Start game
            </SmallButton>
          )}
          {timed &&
            (game.frozen ? (
              <SmallButton
                className={COMPACT}
                tone="success"
                onClick={() => post('resume')}
                disabled={action.busy}
              >
                <Play className="h-4 w-4" aria-hidden /> Resume
              </SmallButton>
            ) : (
              <SmallButton
                className={COMPACT}
                tone="muted"
                onClick={() => post('freeze')}
                disabled={action.busy}
              >
                <Pause className="h-4 w-4" aria-hidden />
                {game.phase === 'PAUSE' ? 'Freeze' : 'Pause'}
              </SmallButton>
            ))}
          {timed && (
            <>
              <SmallButton
                className={COMPACT}
                variant="outline"
                onClick={() => post('extend', { seconds: 60 })}
                disabled={action.busy}
              >
                <Plus className="h-4 w-4" aria-hidden /> 1 min
              </SmallButton>
              <SmallButton
                className={COMPACT}
                variant="outline"
                onClick={() => post('extend', { seconds: 300 })}
                disabled={action.busy}
              >
                <Plus className="h-4 w-4" aria-hidden /> 5 min
              </SmallButton>
            </>
          )}
          {game.phase !== 'LOBBY' && !game.ended && (
            <SmallButton
              className={COMPACT}
              variant="outline"
              tone="danger"
              onClick={() => setConfirm('end')}
              disabled={action.busy}
            >
              {game.phase === 'REVEAL' ? (
                <Square className="h-4 w-4" aria-hidden />
              ) : (
                <FastForward className="h-4 w-4" aria-hidden />
              )}
              {END_PHASE_TEXT[game.phase].label}
            </SmallButton>
          )}
          {!game.ended && (
            <SmallButton
              className={COMPACT}
              variant="outline"
              tone="muted"
              onClick={() => setMessaging(true)}
            >
              <Megaphone className="h-4 w-4" aria-hidden /> Message all
            </SmallButton>
          )}
        </div>
      )}
      {!isAdmin && (
        <p className="ml-auto text-sm text-ink-muted">
          Co-facilitator · {state.teams.length} team{state.teams.length === 1 ? '' : 's'}
        </p>
      )}
      <div className="basis-full empty:hidden">
        <Status error={action.error} />
      </div>

      {confirm && (
        <PhaseConfirm
          state={state}
          start={confirm === 'start'}
          busy={action.busy}
          error={action.error}
          onClose={() => {
            action.clear();
            setConfirm(null);
          }}
          onConfirm={async () => {
            const done = await post(confirm === 'start' ? 'start' : 'end-phase');
            if (done !== undefined) setConfirm(null);
          }}
        />
      )}
      {messaging && (
        <MessageDialog onClose={() => setMessaging(false)} onDone={() => setMessaging(false)} />
      )}
    </header>
  );
}

function PhaseConfirm({
  state,
  start,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  state: StaffState;
  start: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const text = END_PHASE_TEXT[start ? 'LOBBY' : state.game.phase];
  return (
    <Dialog
      title={text.title}
      onClose={onClose}
      onSubmit={onConfirm}
      submitLabel={text.label}
      tone={start ? 'success' : 'danger'}
      busy={busy}
      error={error}
    >
      <p>{text.body}</p>
    </Dialog>
  );
}
