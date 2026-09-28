import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

// A row of big single-character boxes (codes). Typing moves to the next box, Backspace on an
// empty box moves back, and pasting fills the boxes from the one pasted into.

export function DigitBoxes({
  values,
  onChange,
  disabled,
  label,
  locked = [],
  pattern = /^\d$/,
  captions = [],
  gapAfter = [],
  placeholders = [],
  size = 'lg',
}: {
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  // Accessible name for each box: "Digit 1", ...
  label: string;
  // Boxes filled by the game (for example a hint) that cannot be changed.
  locked?: boolean[];
  pattern?: RegExp;
  // Small text under a box ("Clue 1"), and boxes followed by a dash.
  captions?: (string | undefined)[];
  gapAfter?: number[];
  // Faint text in an empty box until something is typed (for example the Vault marker).
  placeholders?: (string | undefined)[];
  size?: 'md' | 'lg';
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) => refs.current[i]?.focus();

  function set(i: number, char: string) {
    const next = [...values];
    next[i] = char;
    onChange(next);
  }

  function onInput(i: number, raw: string) {
    const char = [...raw].reverse().find((c) => pattern.test(c)) ?? '';
    set(i, char.toUpperCase());
    if (char) focus(nextOpen(i + 1));
  }

  // The next box that can be typed in, from i on.
  function nextOpen(i: number): number {
    let j = i;
    while (j < values.length && locked[j]) j++;
    return j;
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !values[i] && i > 0) {
      e.preventDefault();
      let j = i - 1;
      while (j > 0 && locked[j]) j--;
      if (!locked[j]) set(j, '');
      focus(j);
    } else if (e.key === 'ArrowLeft' && i > 0) {
      focus(i - 1);
    } else if (e.key === 'ArrowRight') {
      focus(i + 1);
    }
  }

  function onPaste(i: number, e: ClipboardEvent<HTMLInputElement>) {
    const chars = [...e.clipboardData.getData('text')].filter((c) => pattern.test(c));
    if (chars.length === 0) return;
    e.preventDefault();
    const next = [...values];
    let j = i;
    for (const c of chars) {
      j = nextOpen(j);
      if (j >= next.length) break;
      next[j] = c.toUpperCase();
      j++;
    }
    onChange(next);
    focus(Math.min(nextOpen(j), next.length - 1));
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      {values.map((v, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex flex-col items-center gap-1">
            <input
              ref={(el) => {
                refs.current[i] = el;
              }}
              aria-label={`${label} ${i + 1}`}
              value={v}
              disabled={disabled}
              readOnly={locked[i]}
              placeholder={placeholders[i]}
              inputMode={pattern.test('1') ? 'numeric' : 'text'}
              autoComplete="off"
              onChange={(e) => onInput(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onPaste={(e) => onPaste(i, e)}
              onFocus={(e) => e.target.select()}
              className={`nums ${size === 'lg' ? 'h-20 w-16 text-5xl' : 'h-16 w-14 text-4xl'} rounded-xl border-2 text-center font-extrabold uppercase placeholder:text-3xl placeholder:opacity-35 focus:border-brand focus:outline-none disabled:opacity-50 ${
                locked[i] ? 'border-info/60 bg-info/15 text-info' : 'border-line bg-page text-ink'
              }`}
            />
            {captions.some(Boolean) && (
              <span className="h-5 text-sm font-semibold text-ink-muted">{captions[i] ?? ''}</span>
            )}
          </div>
          {gapAfter.includes(i) && (
            <span
              className={`px-1 text-4xl font-bold text-ink-muted ${size === 'lg' ? 'pt-5' : 'pt-3'}`}
              aria-hidden
            >
              –
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
