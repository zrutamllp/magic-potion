// Text answers are compared after trimming, lowercasing and collapsing spaces (GAME_RULES section 3).

export function normalizeAnswer(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function matchesAny(answer: string, accepted: readonly string[]): boolean {
  const a = normalizeAnswer(answer);
  return a.length > 0 && accepted.some((x) => normalizeAnswer(x) === a);
}

// Riddle answers are more forgiving: case, spaces, punctuation and the words "a", "an" and
// "the" are ignored, so "The Tooth-Brush." matches "toothbrush".
export function normalizeLoose(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w !== '' && w !== 'a' && w !== 'an' && w !== 'the')
    .join('');
}

export function matchesAnyLoose(answer: string, accepted: readonly string[]): boolean {
  const a = normalizeLoose(answer);
  return a.length > 0 && accepted.some((x) => normalizeLoose(x) === a);
}
