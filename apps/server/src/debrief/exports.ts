import JSZip from 'jszip';
import { EXPORT_FILES, exportFileName, type ExportName } from '@magic-potion/shared';
import type { GameEngine } from '../engine/engine';
import type { StoredAuditRow } from '../live/store';
import { toCsv } from './csv';
import { dilemmaRows, firstMessages } from './debrief';

// The CSV exports from GAME_RULES section 13, one file each, and all of them in one zip.

function validZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return true;
  } catch {
    return false;
  }
}

// Times in the facilitator's own time zone (sent by the browser), e.g. "2026-09-29 14:05:09".
export function timeFormatter(timeZone: string): (ms: number | null) => string {
  const zone = validZone(timeZone) ? timeZone : 'UTC';
  const f = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return (ms) => (ms === null ? '' : f.format(new Date(ms)));
}

export interface ExportSources {
  engine: GameEngine;
  // The whole audit log, oldest first.
  audit: () => Promise<StoredAuditRow[]>;
  time: (ms: number | null) => string;
}

const json = (v: unknown) => (v === null || v === undefined ? '' : JSON.stringify(v));

export async function buildCsv(name: ExportName, src: ExportSources): Promise<string> {
  const { engine, time } = src;
  const s = engine.state;
  const teamName = (id: string) => s.teams[id]?.name ?? '';
  switch (name) {
    case 'scores': {
      const board = engine.leaderboard();
      const rows = board.entries.map((e) => [
        e.rank,
        e.name,
        e.tasksCompleted,
        e.score.taskPoints,
        e.score.timeBonus,
        e.score.taskFundsPoints,
        e.score.inboxBonus,
        e.score.collaborationBonus,
        e.score.fundsReceivedPoints,
        e.score.potionBonus,
        e.score.total,
        e.taskFunds,
        e.fundsGiven,
        e.fundsReceived,
      ]);
      // Removed teams get no score (GAME_RULES section 9) but are listed for the record.
      for (const t of Object.values(s.teams)) {
        if (t.status === 'REMOVED')
          rows.push(['Removed', t.name, '', '', '', '', '', '', '', '', '', t.taskFunds, '', '']);
      }
      return toCsv(
        [
          'Rank',
          'Team',
          'Tasks done',
          'Task points',
          'Time bonus',
          'Task Funds points',
          'Inbox bonus',
          'Collaboration bonus',
          'Funds received',
          'Full Potion Bonus',
          'Score',
          'Task Funds',
          'Funds given',
          'Funds received (amount)',
        ],
        rows,
      );
    }
    case 'transfers':
      return toCsv(
        ['Sent at', 'From team', 'To team', 'Amount', 'Arrived at', 'From a request'],
        Object.values(s.transfers)
          .sort((a, b) => a.sentAt - b.sentAt)
          .map((t) => [
            time(t.sentAt),
            teamName(t.fromTeamId),
            teamName(t.toTeamId),
            t.amount,
            time(t.arrivedAt),
            t.fundRequestId ? 'Yes' : 'No',
          ]),
      );
    case 'chat':
      return toCsv(
        ['Time', 'Round', 'Team', 'Message'],
        s.chat.map((m) => [time(m.createdAt), m.round, teamName(m.teamId), m.body]),
      );
    case 'dilemma-answers':
      return toCsv(
        ['Team', 'Option chosen', 'Reason'],
        dilemmaRows(s, engine.gameContent).map((r) => [r.teamName, r.option, r.reason]),
      );
    case 'audit-log':
      return toCsv(
        ['Time', 'Staff', 'Team', 'Action', 'Before', 'After', 'Reason', 'Undone at'],
        (await src.audit()).map((r) => [
          time(r.createdAt),
          r.staffName,
          r.teamName ?? '',
          r.action,
          json(r.before),
          json(r.after),
          r.reason ?? '',
          time(r.undoneAt),
        ]),
      );
    case 'first-messages':
      return toCsv(
        ['Team', 'First message at', 'Round', 'Minutes after the start'],
        firstMessages(s).map((m) => [
          m.teamName,
          m.at === null ? 'No message' : time(m.at),
          m.round ?? '',
          m.minutesAfterStart ?? '',
        ]),
      );
  }
}

export async function buildZip(src: ExportSources): Promise<Buffer> {
  const zip = new JSZip();
  const game = src.engine.state.name;
  for (const f of EXPORT_FILES) zip.file(exportFileName(game, f.name), await buildCsv(f.name, src));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
