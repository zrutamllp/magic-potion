// Text answers are compared after trimming, lowercasing and collapsing spaces (GAME_RULES section 3).

export function normalizeAnswer(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function matchesAny(answer: string, accepted: readonly string[]): boolean {
  const a = normalizeAnswer(answer);
  return a.length > 0 && accepted.some((x) => normalizeAnswer(x) === a);
}
