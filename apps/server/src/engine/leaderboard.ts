import type { TeamStatus } from '@magic-potion/shared';
import { isPotionFull, potionPercent, type Potion } from './potion';
import { scoreTeam, type ScoreBreakdown, type ScoreInput, type ScoringSettings } from './scoring';

// The leaderboard (GAME_RULES sections 9 and 10). Pure.

export interface LeaderboardTeam extends ScoreInput {
  teamId: string;
  name: string;
  status: TeamStatus;
}

export interface LeaderboardEntry extends LeaderboardTeam {
  rank: number;
  score: ScoreBreakdown;
}

export interface Leaderboard {
  potion: Potion;
  potionPercent: number;
  // The final leaderboard counts only if the potion is full. Otherwise nobody wins.
  valid: boolean;
  entries: LeaderboardEntry[];
}

export function buildLeaderboard(
  teams: readonly LeaderboardTeam[],
  settings: ScoringSettings,
  potion: Potion,
  opts: { includePotionBonus: boolean },
): Leaderboard {
  const potionFull = isPotionFull(potion);
  const scored = teams
    .filter((t) => t.status === 'ACTIVE')
    .map((t) => ({
      ...t,
      score: scoreTeam(t, settings, { potionFull, includePotionBonus: opts.includePotionBonus }),
    }))
    .sort(
      (a, b) =>
        b.score.total - a.score.total ||
        b.tasksCompleted - a.tasksCompleted ||
        a.name.localeCompare(b.name),
    );

  // Equal scores share a rank and the next rank is skipped: 1, 2, 2, 4.
  const entries: LeaderboardEntry[] = [];
  for (const [i, t] of scored.entries()) {
    const prev = entries[i - 1];
    const rank = prev && prev.score.total === t.score.total ? prev.rank : i + 1;
    entries.push({ ...t, rank });
  }

  return { potion, potionPercent: potionPercent(potion), valid: potionFull, entries };
}
