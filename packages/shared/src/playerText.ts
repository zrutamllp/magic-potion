// GAME_RULES section 16: player-facing text states facts only. It never tells teams to
// cooperate, never explains the Round 1 / Round 2 difference, and never explains Found items.
// Tests check the Rules tab, the screens and the sample content against this list.
export const FORBIDDEN_PLAYER_TEXT: readonly RegExp[] = [
  /cooperat/i,
  /collaborat/i,
  /work together/i,
  /\btogether\b/i,
  /teamwork/i,
  /help each other/i,
  /helping/i,
  /\bhelp\b/i,
  /team up/i,
  /use the chat/i,
  /talk to/i,
  /who needs/i,
  /other teams need/i,
  /another team holds/i,
  /\bheld by\b/i,
  /in round 2 you see/i,
  /every team'?s score/i,
  /share (your|the) /i,
];

export function forbiddenPhrases(text: string): string[] {
  return FORBIDDEN_PLAYER_TEXT.filter((p) => p.test(text)).map((p) => p.source);
}

// The words in a text that match the list, for a warning ("help", "together").
export function forbiddenMatches(text: string): string[] {
  const found = FORBIDDEN_PLAYER_TEXT.map((p) => p.exec(text)?.[0]).filter(
    (m): m is string => m !== undefined,
  );
  return [...new Set(found.map((m) => m.trim().toLowerCase()))];
}
