import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Lock, Pencil } from 'lucide-react';
import type { AdminGame } from '@magic-potion/shared';
import { PHASE_LABEL } from '../../player/layout/Shell';
import { GAME_TABS, type GameTab } from '../router';
import { errorText, useStaff } from '../StaffContext';
import { SmallButton, Status, inputBase, useAction } from '../ui';
import { BrandingTab } from './BrandingTab';
import { FacilitatorsTab } from './FacilitatorsTab';
import { SettingsTab } from './SettingsTab';
import { TeamsTab } from './TeamsTab';

// One game's setup: settings, branding, teams and co-facilitators.

const TAB_LABEL: Record<GameTab, string> = {
  settings: 'Settings',
  branding: 'Branding',
  teams: 'Teams',
  facilitators: 'Co-facilitators',
};

export interface GameTabProps {
  game: AdminGame;
  onChange: (game: AdminGame) => void;
}

export function GamePage({ gameId, tab }: { gameId: string; tab: GameTab }) {
  const { api, go, freshLogins, setFreshLogins } = useStaff();
  const [game, setGame] = useState<AdminGame | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AdminGame>(`/games/${gameId}`)
      .then(setGame, (e: unknown) => setLoadError(errorText(e)));
  }, [api, gameId]);

  // Passwords from another game are not shown here, and are forgotten on leaving.
  useEffect(() => {
    if (freshLogins && freshLogins.gameId !== gameId) setFreshLogins(null);
  }, [freshLogins, gameId, setFreshLogins]);

  return (
    <div>
      <button
        type="button"
        onClick={() => go({ page: 'games' })}
        className="mb-2 inline-flex items-center gap-1 text-base text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All games
      </button>
      <Status error={loadError} />
      {game && (
        <>
          <Header game={game} onChange={setGame} />
          <nav className="mb-4 flex gap-1 border-b border-line" aria-label="Game setup">
            {GAME_TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => go({ page: 'game', gameId, tab: t })}
                aria-current={t === tab ? 'page' : undefined}
                className={`-mb-px border-b-2 px-4 py-2 text-base font-semibold ${
                  t === tab
                    ? 'border-brand text-ink'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </nav>
          {tab === 'settings' && <SettingsTab game={game} onChange={setGame} />}
          {tab === 'branding' && <BrandingTab game={game} onChange={setGame} />}
          {tab === 'teams' && <TeamsTab game={game} onChange={setGame} />}
          {tab === 'facilitators' && <FacilitatorsTab game={game} onChange={setGame} />}
        </>
      )}
    </div>
  );
}

function Header({ game, onChange }: GameTabProps) {
  const { api } = useStaff();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(game.name);
  const action = useAction();

  async function save(e: FormEvent) {
    e.preventDefault();
    const updated = await action.run(() => api.patch<AdminGame>(`/games/${game.id}`, { name }));
    if (updated) {
      onChange(updated);
      setEditing(false);
    }
  }

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-3">
        {editing ? (
          <form onSubmit={save} className="flex items-center gap-2">
            <input
              aria-label="Game name"
              className={`${inputBase} w-96 text-xl font-bold`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
              autoFocus
            />
            <SmallButton type="submit" disabled={action.busy}>
              Save
            </SmallButton>
            <SmallButton variant="outline" tone="muted" onClick={() => setEditing(false)}>
              Cancel
            </SmallButton>
          </form>
        ) : (
          <>
            <h1 className="text-3xl font-extrabold text-brand-soft">{game.name}</h1>
            <button
              type="button"
              onClick={() => {
                setName(game.name);
                setEditing(true);
              }}
              className="text-ink-muted hover:text-ink"
              aria-label="Rename game"
            >
              <Pencil className="h-5 w-5" aria-hidden />
            </button>
          </>
        )}
        <span className="rounded-full bg-card-raised px-3 py-0.5 text-sm font-semibold text-ink-muted">
          {PHASE_LABEL[game.phase]}
        </span>
        <span className="text-sm text-ink-muted">{game.teams.length} teams</span>
      </div>
      <Status error={action.error} />
      {game.locked && (
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-warning/50 bg-warning/10 px-4 py-2 text-base">
          <Lock className="h-4 w-4 text-warning" aria-hidden />
          The game has started. Settings, branding and the team list are locked. Live changes come
          from the facilitator dashboard.
        </p>
      )}
    </div>
  );
}
