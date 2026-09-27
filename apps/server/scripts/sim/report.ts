import type { SimResult } from './run';

// Formats the simulation result as plain text and CSV.

const n = (x: number) => x.toLocaleString('en-US');
const pct = (completed: number, total: number) =>
  total === 0 ? '0%' : `${Math.round((completed / total) * 1000) / 10}%`;

const COLUMNS = [
  'Rank',
  'Team',
  'Tasks',
  'Time bonus',
  'Task Funds',
  'x2',
  'Inbox',
  'Given',
  'Collab bonus',
  'Received',
  '-2x Received',
  'Potion bonus',
  'Score',
] as const;

function rows(result: SimResult): string[][] {
  return result.leaderboard.entries.map((e) => [
    String(e.rank),
    e.name,
    `${e.tasksCompleted}/5`,
    n(e.score.timeBonus),
    n(e.taskFunds),
    n(e.score.taskFundsPoints),
    n(e.score.inboxBonus),
    n(e.fundsGiven),
    n(e.score.collaborationBonus),
    n(e.fundsReceived),
    n(e.score.fundsReceivedPoints),
    n(e.score.potionBonus),
    n(e.score.total),
  ]);
}

function table(header: readonly string[], body: string[][]): string {
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => (r[i] ?? '').length)));
  const line = (cells: readonly string[]) =>
    cells
      .map((c, i) => (i === 1 ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0)))
      .join('  ');
  return [line(header), widths.map((w) => '-'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}

export function formatReport(result: SimResult, title: string): string {
  const lb = result.leaderboard;
  const out: string[] = [];
  out.push(title, '='.repeat(title.length), '');

  out.push('Timeline (play clock / wall clock since start)');
  for (const t of result.timeline) out.push(`  ${t.playClock}  ${t.wallClock}  ${t.text}`);
  out.push('');

  const h = result.halftime;
  const f = result.final;
  out.push(
    `Potion at halftime: ${h ? `${pct(h.completedTeams, h.totalTeams)} (${h.completedTeams} of ${h.totalTeams} teams)` : 'not saved'}`,
    `Potion at the end:  ${f ? `${pct(f.completedTeams, f.totalTeams)} (${f.completedTeams} of ${f.totalTeams} teams)` : 'not saved'}`,
    '',
  );

  out.push('What happened');
  for (const [k, v] of Object.entries(result.counts).sort(([a], [b]) => a.localeCompare(b))) {
    out.push(`  ${k.padEnd(24)} ${n(v)}`);
  }
  out.push('');

  out.push('Final leaderboard');
  out.push(table(COLUMNS, rows(result)));
  out.push('');
  out.push(
    lb.valid
      ? 'Potion 100%: the leaderboard is valid. Every team gets the 15,000 Full Potion Bonus.'
      : `Potion ${pct(lb.potion.completedTeams, lb.potion.totalTeams)}: the potion is not full, so nobody wins. Scores are shown anyway.`,
  );
  out.push('');
  out.push(
    'Score = 10,000 x tasks + time bonus + 2 x Task Funds + inbox + min(floor(1.5 x given), 10,000)',
    '        - 2 x received + Full Potion Bonus (15,000, only if the potion is full)',
    'Time bonus = 5 x play seconds left when the 5th task was done (0 if not all 5 done).',
    '',
  );

  out.push('Checks');
  for (const c of result.checks) {
    out.push(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
  }
  const failed = result.checks.filter((c) => !c.ok).length;
  out.push('', failed === 0 ? 'All checks passed.' : `${failed} check(s) FAILED.`);
  return out.join('\n');
}

export function toCsv(result: SimResult): string {
  const raw = result.leaderboard.entries.map((e) => [
    e.rank,
    e.name,
    e.tasksCompleted,
    e.score.timeBonus,
    e.taskFunds,
    e.score.taskFundsPoints,
    e.score.inboxBonus,
    e.fundsGiven,
    e.score.collaborationBonus,
    e.fundsReceived,
    e.score.fundsReceivedPoints,
    e.score.potionBonus,
    e.score.total,
  ]);
  const esc = (v: string | number) =>
    /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  return [COLUMNS.join(','), ...raw.map((r) => r.map(esc).join(','))].join('\n') + '\n';
}
