// Potion fill (GAME_RULES section 8). A team's share pours in only when it completes all 5 tasks.
// Removed teams do not count.

export interface Potion {
  completedTeams: number;
  totalTeams: number;
}

export function potionPercent(p: Potion): number {
  return p.totalTeams === 0 ? 0 : (p.completedTeams / p.totalTeams) * 100;
}

export function isPotionFull(p: Potion): boolean {
  return p.totalTeams > 0 && p.completedTeams === p.totalTeams;
}
