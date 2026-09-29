import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  DEFAULT_SETTINGS,
  type Ack,
  type GameSettings,
  type PackItemData,
  type PackOptions,
  type PlayerState,
  type PlayerTaskView,
  type TaskKey,
} from '@magic-potion/shared';
import { monotonicNow, msLeft, useTicker } from '../../lib/time';
import { GameContext, type Game, type Notice } from '../../player/GameContext';
import { Branded } from '../../player/PlayerApp';
import { TaskScreen } from '../../player/tasks/TaskShell';
import { errorText, useStaff } from '../StaffContext';
import { Status } from '../ui';

// "Preview as player": the real task screen, played against a preview session on the server.
// Answers are checked by the game's own checkers there and never reach the browser.

interface Snapshot {
  id: string;
  task: PlayerTaskView;
  note: string | null;
}

let noticeCount = 0;
const nextNoticeId = () => ++noticeCount;

const EVENTS: Record<string, string> = {
  'task:start': 'start',
  'task:submit': 'submit',
  'task:hint': 'hint',
  'task:giveUp': 'give-up',
};

export function PreviewModal({
  taskKey,
  items,
  options,
  gameId,
  branding = DEFAULT_SETTINGS.branding,
  onClose,
}: {
  taskKey: TaskKey;
  items: PackItemData[];
  options?: PackOptions;
  // Play with a game's settings (timers, per-try counts) when opened from a game.
  gameId?: string;
  branding?: GameSettings['branding'];
  onClose: () => void;
}) {
  const { api } = useStaff();
  const [snapshot, setSnapshot] = useState<{ value: Snapshot; receivedAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const now = useTicker();

  useEffect(() => {
    let live = true;
    api
      .post<Snapshot>('/preview', { taskKey, items, options, gameId })
      .then((value) => live && setSnapshot({ value, receivedAt: monotonicNow() }))
      .catch((e: unknown) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [api, taskKey, items, options, gameId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const state: PlayerState | null = snapshot ? previewState(snapshot.value.task, branding) : null;

  const game: Game | null = state
    ? {
        state,
        feed: [],
        status: 'online',
        send: (async (event: string, payload: { submission?: unknown }) => {
          const action = EVENTS[event];
          if (!action || !snapshot) return { ok: false, message: 'Not in the preview.' };
          try {
            const reply = await api.post<{ ack: Ack; preview: Snapshot | null }>(
              `/preview/${snapshot.value.id}/${action}`,
              { submission: payload?.submission },
            );
            if (reply.preview) setSnapshot({ value: reply.preview, receivedAt: monotonicNow() });
            return reply.ack;
          } catch (e) {
            return { ok: false, message: errorText(e) };
          }
        }) as Game['send'],
        phaseMsLeft: () => null,
        timerMsLeft: (sent) => msLeft(sent, snapshot!.receivedAt, true, now) ?? 0,
        act: async (done, run) => {
          const ack = await run().catch(() => ({
            ok: false as const,
            message: 'Something went wrong.',
          }));
          if (ack.ok && done === null) {
            setNotice(null);
            return true;
          }
          setNotice({
            ok: ack.ok,
            text: ack.ok ? (done ?? '') : ack.message,
            id: nextNoticeId(),
            where: 'preview',
          });
          return ack.ok;
        },
        notice,
        dismissNotice: () => setNotice(null),
        route: { tab: 'task', taskId: snapshot!.value.id },
        // "Back to Home" in the task screen closes the preview.
        go: () => onClose(),
      }
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Preview as player"
      className="fixed inset-0 z-50 flex flex-col bg-page"
    >
      <div className="flex items-center justify-between border-b border-warning/60 bg-warning/15 px-5 py-2">
        <p className="font-semibold">
          Preview as player. Nothing is saved
          {snapshot?.value.note ? `. ${snapshot.value.note}` : '.'}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 font-semibold hover:underline"
        >
          <X className="h-5 w-5" aria-hidden /> Close preview
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Status error={error} />
        {game && (
          <GameContext.Provider value={game}>
            <Branded branding={branding}>
              <main className="mx-auto max-w-6xl p-4 md:p-6">
                {notice && (
                  <p
                    role={notice.ok ? 'status' : 'alert'}
                    className={`mb-3 rounded-xl px-4 py-2 text-lg ${notice.ok ? 'bg-success/15' : 'bg-alert/20'}`}
                  >
                    {notice.text}
                  </p>
                )}
                <TaskScreen taskId={snapshot!.value.id} />
              </main>
            </Branded>
          </GameContext.Provider>
        )}
      </div>
    </div>
  );
}

// Just enough of a player's state for one task screen.
function previewState(task: PlayerTaskView, branding: GameSettings['branding']): PlayerState {
  return {
    game: {
      id: 'preview',
      name: 'Preview',
      phase: 'ROUND1',
      frozen: false,
      timersRunning: true,
      phaseMsLeft: null,
      playMsRemaining: 0,
      ended: false,
      serverNow: 0,
    },
    branding,
    settings: DEFAULT_SETTINGS,
    team: {
      id: 'preview-team',
      name: 'Preview',
      taskFunds: DEFAULT_SETTINGS.funds.taskFundsStart,
      supportFunds: DEFAULT_SETTINGS.funds.supportFundsStart,
      tasksDone: 0,
      tasks: [task],
      foundItems: [],
    },
    potion: { percent: 0, completedTeams: 0, totalTeams: 1, halftime: null },
    chat: { messagesLeft: 0, messagesPerRound: 0, maxLength: 0 },
    teams: [],
    pendingTransfers: [],
    pendingRequests: [],
    transactions: [],
    inbox: [],
    leaderboard: null,
  };
}
