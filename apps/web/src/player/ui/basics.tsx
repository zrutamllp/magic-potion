import type { ReactNode } from 'react';

// Small shared pieces in the card style of the designs.

export function Card({
  children,
  className = '',
  tone,
}: {
  children: ReactNode;
  className?: string;
  // A coloured border, like the section colours in the designs.
  tone?: Tone;
}) {
  return (
    <section
      className={`rounded-2xl border bg-card p-5 ${tone ? TONE_BORDER[tone] : 'border-line'} ${className}`}
    >
      {children}
    </section>
  );
}

export type Tone = 'brand' | 'info' | 'success' | 'warning' | 'alert' | 'danger' | 'muted';

export const TONE_TEXT: Record<Tone, string> = {
  brand: 'text-brand-soft',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  alert: 'text-alert',
  danger: 'text-danger',
  muted: 'text-ink-muted',
};

export const TONE_BG: Record<Tone, string> = {
  brand: 'bg-brand/20',
  info: 'bg-info/15',
  success: 'bg-success/15',
  warning: 'bg-warning/15',
  alert: 'bg-alert/15',
  danger: 'bg-danger/15',
  muted: 'bg-card-raised',
};

const TONE_BORDER: Record<Tone, string> = {
  brand: 'border-brand/60',
  info: 'border-info/50',
  success: 'border-success/50',
  warning: 'border-warning/50',
  alert: 'border-alert/50',
  danger: 'border-danger/60',
  muted: 'border-line',
};

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-sm font-semibold ${TONE_BG[tone]} ${TONE_TEXT[tone]}`}
    >
      {children}
    </span>
  );
}

export function PageTitle({
  title,
  tone = 'brand',
  subtitle,
  right,
}: {
  title: string;
  tone?: Tone;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className={`text-3xl font-extrabold ${TONE_TEXT[tone]}`}>{title}</h1>
        {subtitle && <p className="mt-1 text-lg text-ink-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Button({
  children,
  onClick,
  tone = 'brand',
  variant = 'solid',
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'brand' | 'success' | 'danger' | 'muted';
  variant?: 'solid' | 'outline';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const solid = {
    brand: 'bg-brand hover:bg-brand-soft text-white',
    success: 'bg-success hover:brightness-110 text-page',
    danger: 'bg-danger hover:brightness-110 text-white',
    muted: 'bg-card-raised hover:bg-line text-ink',
  }[tone];
  const outline = {
    brand: 'border border-brand text-brand-soft hover:bg-brand/15',
    success: 'border border-success text-success hover:bg-success/10',
    danger: 'border border-danger text-danger hover:bg-danger/10',
    muted: 'border border-line text-ink hover:bg-card-raised',
  }[tone];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-lg font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${
        variant === 'solid' ? solid : outline
      } ${className}`}
    >
      {children}
    </button>
  );
}

export const fieldClass =
  'w-full rounded-xl border border-line bg-page px-4 py-2.5 text-lg text-ink placeholder:text-ink-muted/70 focus:border-brand focus:outline-none';
