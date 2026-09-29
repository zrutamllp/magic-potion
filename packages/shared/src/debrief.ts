// The facilitator's debrief after the game, and the CSV exports (GAME_RULES section 13).
// Main admin only. Both open at the Reveal, when scores are final.

export interface DebriefFirstMessage {
  teamName: string;
  // Null when the team never sent a chat message.
  at: number | null;
  round: number | null;
  // Minutes from the game start (Round 1) to the message, pauses included.
  minutesAfterStart: number | null;
}

export interface DebriefFundsLine {
  fromTeamName: string;
  toTeamName: string;
  // Arrived transfers only, added up for the pair.
  amount: number;
  transfers: number;
}

export interface DebriefTeamFunds {
  teamName: string;
  given: number;
  received: number;
}

export interface DebriefDilemmaOption {
  option: string;
  answers: { teamName: string; reason: string }[];
}

export interface DebriefView {
  gameName: string;
  startedAt: number | null;
  potion: {
    halftime: { percent: number; completedTeams: number; totalTeams: number } | null;
    final: { percent: number; completedTeams: number; totalTeams: number } | null;
  };
  firstMessages: DebriefFirstMessage[];
  funds: DebriefFundsLine[];
  teamFunds: DebriefTeamFunds[];
  // Every option of the scenario, in order, even with no answers.
  dilemma: DebriefDilemmaOption[];
}

export const EXPORT_FILES = [
  { name: 'scores', label: 'Final scores' },
  { name: 'transfers', label: 'Every transfer' },
  { name: 'chat', label: 'Every chat message' },
  { name: 'dilemma-answers', label: 'Ethical Dilemma answers' },
  { name: 'audit-log', label: 'Audit log' },
  { name: 'first-messages', label: 'First message per team' },
] as const;
export type ExportName = (typeof EXPORT_FILES)[number]['name'];

// "Acme Offsite: Day 1!" -> "acme-offsite-day-1", for file names.
export function fileSlug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return s || 'game';
}

export function exportFileName(gameName: string, name: ExportName | 'all'): string {
  return `${fileSlug(gameName)}-${name}.${name === 'all' ? 'zip' : 'csv'}`;
}
