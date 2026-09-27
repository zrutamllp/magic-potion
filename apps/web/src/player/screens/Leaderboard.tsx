import { Crown, Medal } from 'lucide-react';
import type { LeaderboardRowView, PlayerState } from '@magic-potion/shared';
import { money } from '../../lib/time';
import { useGame } from '../GameContext';
import { Card, PageTitle } from '../ui/basics';

// Leaderboard: teams, not players. The server decides which rows a team may see
// (GAME_RULES section 10); this screen shows what it gets. Ranks show only when sent.

export function Leaderboard() {
  const { state } = useGame();
  return (
    <>
      <PageTitle title="Leaderboard" tone="alert" />
      <LeaderboardBody state={state} />
    </>
  );
}

const PODIUM = [
  { place: 1, label: '1st', ring: 'border-warning bg-warning/15', text: 'text-warning' },
  { place: 2, label: '2nd', ring: 'border-ink-muted bg-card-raised', text: 'text-ink' },
  { place: 3, label: '3rd', ring: 'border-alert bg-alert/15', text: 'text-alert' },
];

export function LeaderboardBody({ state }: { state: PlayerState }) {
  const board = state.leaderboard;
  if (!board || board.rows.length === 0) {
    return (
      <Card>
        <p className="text-xl text-ink-muted">The leaderboard is not available right now.</p>
      </Card>
    );
  }
  const ranked = board.rows.some((r) => r.rank !== null);
  // Sent only at the Reveal, for the debrief.
  const funds = board.rows.some((r) => r.fundsGiven !== null);
  const top = ranked ? board.rows.filter((r) => r.rank !== null && r.rank <= 3).slice(0, 3) : [];

  return (
    <div className="space-y-5">
      {top.length >= 3 && (
        <div className="grid grid-cols-3 items-end gap-4">
          {[top[1], top[0], top[2]].map((row, i) =>
            row ? (
              <PodiumCard key={row.teamId} row={row} tall={i === 1} ownId={state.team.id} />
            ) : null,
          )}
        </div>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-lg">
          <thead className="border-b border-line text-base text-ink-muted">
            <tr>
              {ranked && <th className="px-5 py-3">Rank</th>}
              <th className="px-5 py-3">Team</th>
              <th className="px-5 py-3">Tasks</th>
              <th className="px-5 py-3 text-right">Task Funds</th>
              <th className="px-5 py-3 text-right">Score</th>
              <th className="px-5 py-3 text-right">Potion share</th>
              {funds && <th className="px-5 py-3 text-right">Funds given</th>}
              {funds && <th className="px-5 py-3 text-right">Funds received</th>}
            </tr>
          </thead>
          <tbody>
            {board.rows.map((r) => (
              <Row
                key={r.teamId}
                row={r}
                ranked={ranked}
                funds={funds}
                own={r.teamId === state.team.id}
              />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Row({
  row,
  ranked,
  funds,
  own,
}: {
  row: LeaderboardRowView;
  ranked: boolean;
  funds: boolean;
  own: boolean;
}) {
  return (
    <tr className={`border-b border-line last:border-0 ${own ? 'bg-brand/15' : ''}`}>
      {ranked && <td className="nums px-5 py-4 text-xl font-extrabold text-warning">{row.rank}</td>}
      <td className={`px-5 py-4 text-xl font-bold ${own ? 'text-brand-soft' : ''}`}>
        {row.name}
        {own ? ' (you)' : ''}
      </td>
      <td className="nums px-5 py-4">{row.tasksDone}/5</td>
      <td className="nums px-5 py-4 text-right">{money(row.taskFunds)}</td>
      <td className="nums px-5 py-4 text-right text-xl font-extrabold text-success">
        {money(row.score)}
      </td>
      <td className="nums px-5 py-4 text-right">
        {row.potionShare > 0 ? `${Math.round(row.potionShare)}%` : '–'}
      </td>
      {funds && <td className="nums px-5 py-4 text-right">{money(row.fundsGiven ?? 0)}</td>}
      {funds && <td className="nums px-5 py-4 text-right">{money(row.fundsReceived ?? 0)}</td>}
    </tr>
  );
}

function PodiumCard({
  row,
  tall,
  ownId,
}: {
  row: LeaderboardRowView;
  tall: boolean;
  ownId: string;
}) {
  const look = PODIUM.find((p) => p.place === row.rank) ?? PODIUM[2]!;
  const Icon = row.rank === 1 ? Crown : Medal;
  return (
    <div
      className={`flex flex-col items-center rounded-2xl border-2 p-5 text-center ${look.ring} ${
        tall ? 'pb-10' : ''
      }`}
    >
      <Icon className={`h-10 w-10 ${look.text}`} aria-hidden />
      <p className={`mt-2 text-4xl font-extrabold ${look.text}`}>{look.label}</p>
      <p className="mt-2 text-2xl font-bold">
        {row.name}
        {row.teamId === ownId ? ' (you)' : ''}
      </p>
      <p className="nums mt-2 text-2xl font-extrabold text-success">{money(row.score)}</p>
      <p className="text-base text-ink-muted">points</p>
    </div>
  );
}
