// Text answers are compared after trimming, lowercasing and collapsing spaces (GAME_RULES section 3).

export function normalizeAnswer(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function matchesAny(answer: string, accepted: readonly string[]): boolean {
  const a = normalizeAnswer(answer);
  return a.length > 0 && accepted.some((x) => normalizeAnswer(x) === a);
}

// Riddle and Data Story answers are more forgiving: case, spaces, punctuation and the words
// "a", "an" and "the" are ignored, so "The Tooth-Brush." matches "toothbrush". Numbers keep
// their decimal point ("12.5" is not "125") and drop thousands commas ("1,650" is "1650").
export function normalizeLoose(text: string): string {
  return text
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .split(/\s+/)
    .filter((w) => w !== '' && w !== 'a' && w !== 'an' && w !== 'the')
    .join('');
}

export function matchesAnyLoose(answer: string, accepted: readonly string[]): boolean {
  const a = normalizeLoose(answer);
  return a.length > 0 && accepted.some((x) => normalizeLoose(x) === a);
}
