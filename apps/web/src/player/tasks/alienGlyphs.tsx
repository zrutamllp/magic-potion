import type { ReactNode } from 'react';

// The alien alphabet for Alien Translator: 26 bold line glyphs, each built from clearly different
// parts (circles, triangles, squares, bars, dots, arcs), so they stay easy to tell apart on a
// Zoom share. They are drawn in one colour on a 48x48 grid with thick round strokes. None of
// them looks like a Find the Code symbol or a Vault marker. Content refers to them by id
// ("g01" to "g26"); any other symbol is shown as text, so uploaded content still works.

const dot = (cx: number, cy: number) => <circle cx={cx} cy={cy} r={4} fill="currentColor" />;

export const ALIEN_GLYPHS: Record<string, ReactNode> = {
  // Ring with a dot in the middle.
  g01: (
    <>
      <circle cx={24} cy={24} r={17} />
      {dot(24, 24)}
    </>
  ),
  // Triangle over a bar.
  g02: (
    <>
      <path d="M24 6 L41 34 H7 Z" />
      <path d="M7 43 H41" />
    </>
  ),
  // Diamond cut by an upright line.
  g03: (
    <>
      <path d="M24 5 L41 24 L24 43 L7 24 Z" />
      <path d="M24 5 V43" />
    </>
  ),
  // Gate: two posts and a roof.
  g04: <path d="M10 43 V7 H38 V43" />,
  // Arch with two dots under it.
  g05: (
    <>
      <path d="M8 30 A16 16 0 0 1 40 30" />
      {dot(16, 40)}
      {dot(32, 40)}
    </>
  ),
  // X with a ring on top.
  g06: (
    <>
      <circle cx={24} cy={11} r={6} />
      <path d="M10 22 L38 43 M38 22 L10 43" />
    </>
  ),
  // Comb: a post with three teeth.
  g07: <path d="M12 5 V43 M12 8 H36 M12 24 H36 M12 40 H36" />,
  // Cup with a dot above.
  g08: (
    <>
      <path d="M9 18 V36 A6 6 0 0 0 15 42 H33 A6 6 0 0 0 39 36 V18" />
      {dot(24, 9)}
    </>
  ),
  // Ring with a bar through it.
  g09: (
    <>
      <circle cx={24} cy={24} r={12} />
      <path d="M4 24 H44" />
    </>
  ),
  // Rainbow: two arches.
  g10: <path d="M5 38 A19 19 0 0 1 43 38 M15 38 A9 9 0 0 1 33 38" />,
  // Down triangle with a dot inside.
  g11: (
    <>
      <path d="M6 9 H42 L24 41 Z" />
      {dot(24, 20)}
    </>
  ),
  // Square with one diagonal.
  g12: <path d="M8 8 H40 V40 H8 Z M8 40 L40 8" />,
  // Hourglass.
  g13: <path d="M9 6 H39 L9 42 H39 Z" />,
  // Fork with three prongs.
  g14: <path d="M24 44 V20 M8 6 V14 A8 8 0 0 0 16 22 H32 A8 8 0 0 0 40 14 V6 M24 6 V20" />,
  // Plus with a dot at each end.
  g15: (
    <>
      <path d="M24 12 V36 M12 24 H36" />
      {dot(24, 5)}
      {dot(24, 43)}
      {dot(5, 24)}
      {dot(43, 24)}
    </>
  ),
  // Two waves.
  g16: <path d="M4 17 Q14 7 24 17 T44 17 M4 33 Q14 23 24 33 T44 33" />,
  // Hook: an arrow up that curls back down.
  g17: <path d="M16 44 V14 A8 8 0 0 1 32 14 V30 M10 20 L16 12 L22 20" />,
  // Moon with a dot beside it.
  g18: (
    <>
      <path d="M28 6 A18 18 0 1 0 28 42 A13 13 0 1 1 28 6 Z" />
      {dot(38, 24)}
    </>
  ),
  // Three dots in a triangle.
  g19: (
    <>
      <circle cx={24} cy={11} r={6} fill="currentColor" />
      <circle cx={11} cy={36} r={6} fill="currentColor" />
      <circle cx={37} cy={36} r={6} fill="currentColor" />
    </>
  ),
  // Pin: a ring on a post with a foot.
  g20: (
    <>
      <circle cx={24} cy={13} r={8} />
      <path d="M24 21 V43 M14 43 H34" />
    </>
  ),
  // Ladder.
  g21: <path d="M13 4 V44 M35 4 V44 M13 14 H35 M13 24 H35 M13 34 H35" />,
  // Eye.
  g22: (
    <>
      <path d="M4 24 Q24 4 44 24 Q24 44 4 24 Z" />
      {dot(24, 24)}
    </>
  ),
  // Stairs.
  g23: <path d="M5 43 V33 H16 V22 H27 V11 H38 V5" />,
  // Loop, like a lying eight.
  g24: (
    <path d="M24 24 C31 12 44 12 44 24 C44 36 31 36 24 24 C17 12 4 12 4 24 C4 36 17 36 24 24 Z" />
  ),
  // Lightning zigzag.
  g25: <path d="M30 4 L14 24 H34 L18 44" />,
  // Asterisk of three lines.
  g26: <path d="M24 5 V43 M7 14 L41 34 M41 14 L7 34" />,
};

export function isAlienGlyph(symbol: string): boolean {
  return Object.hasOwn(ALIEN_GLYPHS, symbol);
}

// One symbol of the alien message or legend, drawn as a glyph, or as text if it is not one.
export function AlienSymbol({ symbol, size }: { symbol: string; size: number }) {
  const glyph = ALIEN_GLYPHS[symbol];
  if (!glyph) {
    return (
      <span className="leading-none" style={{ fontSize: size * 0.8 }}>
        {symbol}
      </span>
    );
  }
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={4.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Alien symbol"
      data-glyph={symbol}
    >
      {glyph}
    </svg>
  );
}
