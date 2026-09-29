import { useCallback, useState } from 'react';
import { Eye, X } from 'lucide-react';
import type { Ack } from '@magic-potion/shared';
import type { LiveStatus, WatchedTeam } from '../../lib/live';
import { msLeft, useTicker } from '../../lib/time';
import { GameContext, type Game, type Notice } from '../../player/GameContext';
import { Branded, PhaseScreen } from '../../player/PlayerApp';
import { routeHash, type Route } from '../../player/router';

// "View as team" (Phase 6C): exactly the screens a team sees, built from the state the server
// sends that team, so staff can guide them without logging in as them. Read only: nothing a
// staff member clicks here reaches the game.

export const VIEW_ONLY = 'View only. Nothing was sent.';

const viewOnlySend = (): Promise<Ack> => Promise.resolve({ ok: false, message: VIEW_ONLY });

export function TeamViewer({
  teamName,
  watched,
  status,
  onClose,
}: {
  teamName: string;
  watched: WatchedTeam | null;
  status: LiveStatus;
  onClose: () => void;
}) {
  const now = useTicker();
  // Its own screen route, so moving around here never changes the dashboard's address.
  const [route, setRoute] = useState<Route>({ tab: 'home' });
  const [notice, setNotice] = useState<Notice | null>(null);

  const act = useCallback(
    async (_done: string | null, run: () => Promise<Ack>) => {
      const ack = await run();
      setNotice({
        ok: ack.ok,
        text: ack.ok ? '' : ack.message,
        id: Date.now(),
        where: routeHash(route),
      });
      return false;
    },
    [route],
  );

  let game: Game | null = null;
  if (watched) {
    const { state, receivedAt } = watched.snapshot;
    game = {
      state,
      feed: watched.feed,
      status,
      send: viewOnlySend,
      phaseMsLeft: () => msLeft(state.game.phaseMsLeft, receivedAt, !state.game.frozen, now),
      timerMsLeft: (sent) => msLeft(sent, receivedAt, state.game.timersRunning, now) ?? 0,
      act,
      notice: notice && notice.where === routeHash(route) ? notice : null,
      dismissNotice: () => setNotice(null),
      route,
      go: (next) => {
        setNotice(null);
        setRoute(next);
      },
    };
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`View as ${teamName}`}
      className="fixed inset-0 z-50 overflow-y-auto bg-page"
    >
      {game ? (
        <GameContext.Provider value={game}>
          <Branded branding={game.state.branding}>
            <PhaseScreen />
          </Branded>
        </GameContext.Provider>
      ) : (
        <p className="p-8 text-lg text-ink-muted">Loading {teamName}’s screen…</p>
      )}
      <div className="fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-full border border-warning/70 bg-card/95 px-5 py-2 shadow-2xl backdrop-blur">
        <Eye className="h-5 w-5 text-warning" aria-hidden />
        <span className="text-base font-semibold">
          Viewing <strong>{teamName}</strong> as they see it · read only
        </span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-full bg-warning px-3 py-1 text-sm font-bold text-page hover:brightness-110"
        >
          <X className="h-4 w-4" aria-hidden /> Close
        </button>
      </div>
    </div>
  );
}
