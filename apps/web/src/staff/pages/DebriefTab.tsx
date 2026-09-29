import { useEffect, useState } from 'react';
import { Download, FileArchive } from 'lucide-react';
import {
  EXPORT_FILES,
  exportFileName,
  type DebriefView,
  type ExportName,
} from '@magic-potion/shared';
import { money } from '../../lib/time';
import { PotionBottle, potionLabel } from '../../player/ui/PotionBottle';
import { clockTime } from '../live/format';
import { errorText, useStaff } from '../StaffContext';
import { Panel, SmallButton, Status, useAction } from '../ui';
import type { GameTabProps } from './GamePage';

// The facilitator's debrief after the game (Phase 6D, main admin): first messages, who sent
// funds to whom, Ethical Dilemma answers by option, halftime vs final potion, and the CSV
// exports from GAME_RULES section 13. It opens at the Reveal, when the scores are final.

// The browser's time zone, so exported times match the facilitator's clock.
function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function DebriefTab({ game }: GameTabProps) {
  const { api } = useStaff();
  const [debrief, setDebrief] = useState<DebriefView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DebriefView>(`/games/${game.id}/debrief`)
      .then(setDebrief, (e: unknown) => setError(errorText(e)));
  }, [api, game.id]);

  if (error) return <Status error={error} />;
  if (!debrief) return <p className="text-ink-muted">Loading the debrief…</p>;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Exports gameId={game.id} gameName={game.name} />
      <PotionPanel debrief={debrief} />
      <FirstMessages debrief={debrief} />
      <Funds debrief={debrief} />
      <Dilemma debrief={debrief} />
    </div>
  );
}

function Exports({ gameId, gameName }: { gameId: string; gameName: string }) {
  const { api } = useStaff();
  const action = useAction();
  const tz = encodeURIComponent(timeZone());
  const download = (name: ExportName | 'all') =>
    action.run(() =>
      api.download(
        `/games/${gameId}/exports/${name}.${name === 'all' ? 'zip' : 'csv'}?tz=${tz}`,
        exportFileName(gameName, name),
      ),
    );
  return (
    <Panel title="Exports (CSV)" className="xl:col-span-2">
      <div className="flex flex-wrap gap-2">
        {EXPORT_FILES.map((f) => (
          <SmallButton
            key={f.name}
            variant="outline"
            onClick={() => download(f.name)}
            disabled={action.busy}
          >
            <Download className="h-4 w-4" aria-hidden /> {f.label}
          </SmallButton>
        ))}
        <SmallButton onClick={() => download('all')} disabled={action.busy}>
          <FileArchive className="h-4 w-4" aria-hidden /> Download all (zip)
        </SmallButton>
      </div>
      <p className="mt-2 text-sm text-ink-muted">
        Times are in this computer’s time zone. The files open in Excel or Google Sheets.
      </p>
      <Status error={action.error} />
    </Panel>
  );
}

function PotionPanel({ debrief }: { debrief: DebriefView }) {
  const card = (title: string, p: DebriefView['potion']['halftime']) => (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-xl bg-page py-4">
      <span className="text-sm font-bold tracking-wide text-ink-muted uppercase">{title}</span>
      <PotionBottle percent={p?.percent ?? 0} size="md" />
      <span className="nums text-3xl font-extrabold text-accent" aria-label={title}>
        {p ? potionLabel(p.percent) : '—'}
      </span>
      <span className="text-sm text-ink-muted">
        {p ? `${p.completedTeams} of ${p.totalTeams} teams done` : 'Not saved'}
      </span>
    </div>
  );
  return (
    <Panel title="The potion">
      <div className="flex gap-3">
        {card('At halftime', debrief.potion.halftime)}
        {card('At the end', debrief.potion.final)}
      </div>
    </Panel>
  );
}

function FirstMessages({ debrief }: { debrief: DebriefView }) {
  return (
    <Panel title="First message per team">
      <p className="mb-2 text-sm text-ink-muted">
        The chat is one channel for all teams, so this is when each team first reached out.
      </p>
      <table className="w-full text-left text-base">
        <thead className="text-sm text-ink-muted">
          <tr>
            <th className="py-1">Team</th>
            <th className="py-1">Time</th>
            <th className="py-1">Round</th>
            <th className="py-1 text-right">Minutes after the start</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {debrief.firstMessages.map((m) => (
            <tr key={m.teamName}>
              <td className="py-1.5 font-semibold">{m.teamName}</td>
              {m.at === null ? (
                <td className="py-1.5 text-ink-muted" colSpan={3}>
                  No message
                </td>
              ) : (
                <>
                  <td className="py-1.5">{clockTime(m.at)}</td>
                  <td className="py-1.5">{m.round}</td>
                  <td className="nums py-1.5 text-right">{m.minutesAfterStart}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Funds({ debrief }: { debrief: DebriefView }) {
  return (
    <Panel title="Who sent funds to whom">
      {debrief.funds.length === 0 ? (
        <p className="text-ink-muted">No team sent funds to another team.</p>
      ) : (
        <table className="w-full text-left text-base">
          <thead className="text-sm text-ink-muted">
            <tr>
              <th className="py-1">From</th>
              <th className="py-1">To</th>
              <th className="py-1 text-right">Amount</th>
              <th className="py-1 text-right">Transfers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {debrief.funds.map((f) => (
              <tr key={`${f.fromTeamName}>${f.toTeamName}`}>
                <td className="py-1.5 font-semibold">{f.fromTeamName}</td>
                <td className="py-1.5">{f.toTeamName}</td>
                <td className="nums py-1.5 text-right">{money(f.amount)}</td>
                <td className="nums py-1.5 text-right">{f.transfers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3 className="mt-4 mb-1 text-sm font-bold tracking-wide text-ink-muted uppercase">
        Totals per team
      </h3>
      <table className="w-full text-left text-base">
        <thead className="text-sm text-ink-muted">
          <tr>
            <th className="py-1">Team</th>
            <th className="py-1 text-right">Given</th>
            <th className="py-1 text-right">Received</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {debrief.teamFunds.map((t) => (
            <tr key={t.teamName}>
              <td className="py-1.5 font-semibold">{t.teamName}</td>
              <td className="nums py-1.5 text-right">{money(t.given)}</td>
              <td className="nums py-1.5 text-right">{money(t.received)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-sm text-ink-muted">
        Transfers that arrived, as the score counts them.
      </p>
    </Panel>
  );
}

function Dilemma({ debrief }: { debrief: DebriefView }) {
  return (
    <Panel title="Ethical Dilemma answers" className="xl:col-span-2">
      {debrief.dilemma.length === 0 ? (
        <p className="text-ink-muted">No team played the Ethical Dilemma.</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {debrief.dilemma.map((o) => (
            <li key={o.option} className="rounded-xl bg-page p-3">
              <p className="font-bold">
                {o.option}{' '}
                <span className="font-normal text-ink-muted">
                  · {o.answers.length} team{o.answers.length === 1 ? '' : 's'}
                </span>
              </p>
              <ul className="mt-1 space-y-1">
                {o.answers.map((a) => (
                  <li key={a.teamName} className="text-base">
                    <strong>{a.teamName}:</strong> {a.reason}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
