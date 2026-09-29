import { useId } from 'react';

// The Magic Potion: a glass flask whose liquid rises to the potion %. Shown on every screen.

// The flask outline in a 120 x 160 box: a neck, then a round body.
const FLASK = 'M50 12 H70 V52 A50 50 0 1 1 50 52 Z';
// Liquid runs from the bottom of the body (y 151) to just into the neck when full (y 44).
const BOTTOM_Y = 151;
const FULL_Y = 44;
// A wave surface two periods wide, so sliding it by one period loops smoothly.
const WAVE = 'M0 0 Q15 -5 30 0 T60 0 T90 0 T120 0 T150 0 T180 0 T210 0 T240 0 V200 H0 Z';

export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

// The y position of the liquid surface for a fill %.
export function liquidTop(percent: number): number {
  return BOTTOM_Y - ((BOTTOM_Y - FULL_Y) * clampPercent(percent)) / 100;
}

// "33%" for 33.3, "Full" at 100. Never shows 100% before the potion is really full.
export function potionLabel(percent: number): string {
  const p = clampPercent(percent);
  if (p >= 100) return 'Full';
  return `${Math.min(99, Math.round(p))}%`;
}

const SIZES = {
  sm: 'w-12',
  md: 'w-24',
  lg: 'w-36',
  xl: 'w-52',
  // The caller sets the width (the projector sizes it to the screen).
  fluid: '',
} as const;

export function PotionBottle({
  percent,
  size = 'md',
  className = '',
}: {
  percent: number;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const p = clampPercent(percent);
  const full = p >= 100;
  const top = liquidTop(p);

  return (
    <svg
      viewBox="0 0 120 160"
      role="img"
      aria-label={`Magic Potion ${potionLabel(p)}${full ? '' : ' full'}`}
      className={`${SIZES[size]} shrink-0 overflow-visible ${className}`}
      data-percent={Math.round(p)}
    >
      <defs>
        <clipPath id={`flask-${id}`}>
          <path d={FLASK} />
        </clipPath>
        <linearGradient id={`liquid-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" />
          <stop offset="100%" stopColor="var(--color-brand)" />
        </linearGradient>
        <radialGradient id={`glow-${id}`}>
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {full && <circle cx="60" cy="100" r="72" fill={`url(#glow-${id})`} />}

      {/* Glass */}
      <path d={FLASK} fill="rgba(255,255,255,0.07)" />

      {/* Liquid */}
      <g clipPath={`url(#flask-${id})`}>
        <g
          data-testid="potion-liquid"
          style={{ transform: `translateY(${top}px)`, transition: 'transform 1.4s ease-out' }}
        >
          <g className={p > 0 ? 'potion-wave' : undefined}>
            <path d={WAVE} fill={`url(#liquid-${id})`} opacity={p > 0 ? 1 : 0} />
          </g>
        </g>
        {p > 0 &&
          [38, 60, 80].map((x, i) => (
            <circle
              key={x}
              cx={x}
              cy={146}
              r={2.5 + (i % 2)}
              fill="rgba(255,255,255,0.7)"
              className="potion-bubble"
              style={{ animationDelay: `${i * 1.1}s` }}
            />
          ))}
      </g>

      {/* Outline, shine and cork */}
      <path
        d={FLASK}
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M30 84 A36 36 0 0 1 44 66"
        fill="none"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect x="45" y="2" width="30" height="14" rx="4" fill="#b7793f" />
      <rect x="45" y="2" width="30" height="5" rx="2.5" fill="#d9995a" />
    </svg>
  );
}

// The bottle with its % and "2 of 4 teams done" underneath.
export function PotionMeter({
  percent,
  completedTeams,
  totalTeams,
  size = 'md',
  label,
}: {
  percent: number;
  completedTeams: number;
  totalTeams: number;
  size?: keyof typeof SIZES;
  label?: string;
}) {
  const big = size === 'lg' || size === 'xl';
  return (
    <div className="flex flex-col items-center text-center">
      {label && <p className={`font-bold ${big ? 'mb-3 text-2xl' : 'mb-1 text-sm'}`}>{label}</p>}
      <PotionBottle percent={percent} size={size} />
      <p className={`nums mt-2 font-extrabold text-accent ${big ? 'text-5xl' : 'text-2xl'}`}>
        {potionLabel(percent)}
      </p>
      <p className={`text-ink-muted ${big ? 'text-xl' : 'text-sm'}`}>
        {completedTeams} of {totalTeams} teams done
      </p>
    </div>
  );
}
