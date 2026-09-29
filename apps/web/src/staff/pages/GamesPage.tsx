import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Archive, Plus, Trash2 } from 'lucide-react';
import {
  MAX_TEAMS,
  MIN_TEAMS,
  type CreatedGame,
  type StaffGameSummary,
} from '@magic-potion/shared';
import { PHASE_LABEL } from '../../player/layout/Shell';
import { errorText, useStaff } from '../StaffContext';
import { Panel, SmallButton, Status, inputClass, useAction } from '../ui';

// Every game the staff member can see, and (main admin) a form to make a new one.

export function GamesPage() {
  const { api, login } = useStaff();
  const [games, setGames] = useState<StaffGameSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [deleting, setDeleting] = useState<StaffGameSummary | null>(null);
  const isAdmin = login.staff.role === 'MAIN_ADMIN';

  const load = useCallback(() => {
    api
      .get<StaffGameSummary[]>('/games')
      .then(setGames, (e: unknown) => setLoadError(errorText(e)));
  }, [api]);
  useEffect(load, [load]);

  const archivedCount = games?.filter((g) => g.archived).length ?? 0;
  const shown = games?.filter((g) => showArchived || !g.archived) ?? [];

  return (
    <div className="max-w-5xl">
      <h1 className="mb-4 text-3xl font-extrabold text-brand-soft">Games</h1>
      <div className="grid grid-cols-[1fr_22rem] items-start gap-5">
        <Panel
          title="Your games"
          right={
            archivedCount > 0 && (
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                Show archived ({archivedCount})
              </label>
            )
          }
        >
          <Status error={loadError} />
          {games === null && !loadError && <p className="text-ink-muted">Loading…</p>}
          {games !== null && shown.length === 0 && <p className="text-ink-muted">No games yet.</p>}
          <ul className="divide-y divide-line">
            {shown.map((g) => (
              <GameRow
                key={g.id}
                game={g}
                isAdmin={isAdmin}
                onChanged={load}
                onDelete={() => setDeleting(g)}
              />
            ))}
          </ul>
        </Panel>
        {isAdmin && <NewGame />}
      </div>
      {deleting && (
        <DeleteGame
          game={deleting}
          onClose={(deleted) => {
            setDeleting(null);
            if (deleted) load();
          }}
        />
      )}
    </div>
  );
}

function GameRow({
  game: g,
  isAdmin,
  onChanged,
  onDelete,
}: {
  game: StaffGameSummary;
  isAdmin: boolean;
  onChanged: () => void;
  onDelete: () => void;
}) {
  const { api, go } = useStaff();
  const action = useAction();

  async function archive(archived: boolean) {
    const done = await action.run(() =>
      api.post(`/games/${g.id}/${archived ? 'archive' : 'unarchive'}`),
    );
    if (done !== undefined) onChanged();
  }

  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-3">
        <span className={`font-semibold ${g.archived ? 'text-ink-muted' : ''}`}>
          {g.name}
          {g.archived && <span className="ml-2 text-sm font-normal">(archived)</span>}
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-card-raised px-3 py-0.5 text-sm text-ink-muted">
            {PHASE_LABEL[g.phase]}
          </span>
          {isAdmin ? (
            <>
              <SmallButton
                variant="outline"
                onClick={() => go({ page: 'game', gameId: g.id, tab: 'settings' })}
              >
                Set up
              </SmallButton>
              {g.finished && !g.archived && (
                <SmallButton
                  variant="outline"
                  tone="muted"
                  onClick={() => archive(true)}
                  disabled={action.busy}
                >
                  <Archive className="h-4 w-4" aria-hidden /> Archive
                </SmallButton>
              )}
              {g.archived && (
                <SmallButton
                  variant="outline"
                  tone="muted"
                  onClick={() => archive(false)}
                  disabled={action.busy}
                >
                  Unarchive
                </SmallButton>
              )}
              {!g.started && (
                <SmallButton variant="outline" tone="danger" onClick={onDelete}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete
                </SmallButton>
              )}
            </>
          ) : (
            <span className="text-sm text-ink-muted">Dashboard coming soon</span>
          )}
        </span>
      </div>
      <Status error={action.error} />
    </li>
  );
}

// Deleting is only for a game that never started, and only after typing its name.
function DeleteGame({
  game,
  onClose,
}: {
  game: StaffGameSummary;
  onClose: (deleted: boolean) => void;
}) {
  const { api } = useStaff();
  const [typed, setTyped] = useState('');
  const action = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const done = await action.run(() => api.del(`/games/${game.id}`, { confirmName: typed }));
    if (done !== undefined) onClose(true);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Delete game"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-2xl border border-danger/60 bg-card p-6"
      >
        <h2 className="text-xl font-extrabold text-danger">Delete “{game.name}”?</h2>
        <p className="mt-2 text-base">
          This game has never been played. Deleting it removes its teams, logins, settings and
          content copy for good. Content packs are not touched.
        </p>
        <label className="mt-4 block font-semibold">
          Type the game name to confirm
          <input
            className={`${inputClass} mt-1`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={game.name}
            autoFocus
          />
        </label>
        <div className="mt-2">
          <Status error={action.error} />
        </div>
        <div className="mt-4 flex gap-2">
          <SmallButton
            type="submit"
            tone="danger"
            disabled={typed.trim() !== game.name || action.busy}
          >
            {action.busy ? 'Deleting…' : 'Delete game'}
          </SmallButton>
          <SmallButton variant="outline" tone="muted" onClick={() => onClose(false)}>
            Cancel
          </SmallButton>
        </div>
      </form>
    </div>
  );
}

function NewGame() {
  const { api, go, setFreshLogins } = useStaff();
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [teamCount, setTeamCount] = useState('10');
  const action = useAction();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const count = Number(teamCount);
    if (!Number.isInteger(count) || count < MIN_TEAMS || count > MAX_TEAMS) {
      action.setError(`Choose from ${MIN_TEAMS} to ${MAX_TEAMS} teams.`);
      return;
    }
    const created = await action.run(() =>
      api.post<CreatedGame>('/games', { name, clientName, teamCount: count }),
    );
    if (created) {
      setFreshLogins({ gameId: created.game.id, logins: created.logins });
      go({ page: 'game', gameId: created.game.id, tab: 'teams' });
    }
  }

  return (
    <Panel title="New game">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="block font-semibold">
          Game name
          <input
            className={`${inputClass} mt-1`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme leadership offsite"
            maxLength={60}
            required
          />
        </label>
        <label className="block font-semibold">
          Client name
          <input
            className={`${inputClass} mt-1`}
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Shown to players"
            maxLength={100}
          />
        </label>
        <label className="block font-semibold">
          Number of teams
          <input
            type="number"
            className={`${inputClass} mt-1`}
            value={teamCount}
            min={MIN_TEAMS}
            max={MAX_TEAMS}
            onChange={(e) => setTeamCount(e.target.value)}
            required
          />
        </label>
        <p className="text-sm text-ink-muted">
          The game starts with the default settings and the sample task content. You can change the
          settings and team names next.
        </p>
        <Status error={action.error} />
        <SmallButton type="submit" disabled={action.busy}>
          <Plus className="h-4 w-4" aria-hidden />
          {action.busy ? 'Creating…' : 'Create game'}
        </SmallButton>
      </form>
    </Panel>
  );
}
