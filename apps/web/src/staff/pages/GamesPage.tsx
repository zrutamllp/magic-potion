import { useEffect, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
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
  const { api, login, go } = useStaff();
  const [games, setGames] = useState<StaffGameSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isAdmin = login.staff.role === 'MAIN_ADMIN';

  useEffect(() => {
    api
      .get<StaffGameSummary[]>('/games')
      .then(setGames, (e: unknown) => setLoadError(errorText(e)));
  }, [api]);

  return (
    <div className="max-w-5xl">
      <h1 className="mb-4 text-3xl font-extrabold text-brand-soft">Games</h1>
      <div className="grid grid-cols-[1fr_22rem] items-start gap-5">
        <Panel title="Your games">
          <Status error={loadError} />
          {games === null && !loadError && <p className="text-ink-muted">Loading…</p>}
          {games?.length === 0 && <p className="text-ink-muted">No games yet.</p>}
          <ul className="divide-y divide-line">
            {games?.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 py-2">
                <span className="font-semibold">{g.name}</span>
                <span className="flex items-center gap-3">
                  <span className="rounded-full bg-card-raised px-3 py-0.5 text-sm text-ink-muted">
                    {PHASE_LABEL[g.phase]}
                  </span>
                  {isAdmin ? (
                    <SmallButton
                      variant="outline"
                      onClick={() => go({ page: 'game', gameId: g.id, tab: 'settings' })}
                    >
                      Set up
                    </SmallButton>
                  ) : (
                    <span className="text-sm text-ink-muted">Dashboard coming soon</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        {isAdmin && <NewGame />}
      </div>
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
