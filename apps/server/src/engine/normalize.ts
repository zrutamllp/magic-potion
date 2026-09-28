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

// Guess the Celebrity names ignore case, spaces, dots and hyphens, so "M.S. Dhoni" matches
// "ms dhoni" and "Shah Rukh" matches "Shahrukh".
export function normalizeName(text: string): string {
  return text.toLowerCase().replace(/[\s.\-‐‑–—]/g, '');
}

// Names of this many letters or more also forgive one small typo, because name spellings vary.
export const NAME_TYPO_MIN_LENGTH = 6;

// True when a can become b with at most one edit: add, remove or change one letter, or swap
// two letters next to each other.
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

export function matchesName(answer: string, accepted: readonly string[]): boolean {
  const a = normalizeName(answer);
  if (a.length === 0) return false;
  return accepted.some((x) => {
    const n = normalizeName(x);
    return n === a || (n.length >= NAME_TYPO_MIN_LENGTH && withinOneEdit(a, n));
  });
}

// Pictionary guesses are forgiving like Riddle answers, and a simple plural also counts:
// "Keys" matches "key", "the light bulbs" matches "light bulb".
export function matchesWord(answer: string, accepted: readonly string[]): boolean {
  const a = normalizeLoose(answer);
  if (a.length === 0) return false;
  return accepted.some((x) => {
    const n = normalizeLoose(x);
    return n.length > 0 && (a === n || a === `${n}s` || a === `${n}es`);
  });
}
