import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { errorText } from './StaffContext';

// Small form pieces for the admin panel, in the same dark card style as the player app but a
// little denser: staff use it on their own laptop, not on a shared Zoom screen.

// Without a width, for boxes with a fixed width (numbers, colour codes).
export const inputBase =
  'rounded-lg border border-line bg-page px-3 py-1.5 text-base text-ink placeholder:text-ink-muted/70 focus:border-brand focus:outline-none disabled:opacity-60';
export const inputClass = `w-full ${inputBase}`;

export function Panel({
  title,
  children,
  right,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-4 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function SmallButton({
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
  tone?: 'brand' | 'danger' | 'muted' | 'success';
  variant?: 'solid' | 'outline';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const style =
    variant === 'solid'
      ? {
          brand: 'bg-brand hover:bg-brand-soft text-white',
          success: 'bg-success hover:brightness-110 text-page',
          danger: 'bg-danger hover:brightness-110 text-white',
          muted: 'bg-card-raised hover:bg-line text-ink',
        }[tone]
      : {
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-1.5 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${style} ${className}`}
    >
      {children}
    </button>
  );
}

// A success line or an error line under a form.
export function Status({ ok, error }: { ok?: string | null; error?: string | null }) {
  if (error) {
    return (
      <p role="alert" className="text-base text-danger">
        {error}
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="text-base text-success">
        {ok}
      </p>
    );
  }
  return null;
}

// Runs a request with busy, error and "done" message states.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = useCallback(async <T,>(work: () => Promise<T>, doneText?: string) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const value = await work();
      if (doneText) setDone(doneText);
      return value;
    } catch (err) {
      setError(errorText(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  const clear = useCallback(() => {
    setError(null);
    setDone(null);
  }, []);
  return { busy, error, done, run, clear, setError };
}

// Letters and digits for a staff starting password, from the browser's secure random source.
export function randomPassword(length = 12): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
}

// A modal box with a form. Escape or Cancel closes it. Used by the live dashboard (Phase 6C).
export function Dialog({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel,
  tone = 'brand',
  busy = false,
  canSubmit = true,
  error,
  wide = false,
}: {
  title: string;
  children?: ReactNode;
  onClose: () => void;
  // Leave out for a dialog with only a Close button.
  onSubmit?: () => void;
  submitLabel?: string;
  tone?: 'brand' | 'danger' | 'success';
  busy?: boolean;
  canSubmit?: boolean;
  error?: string | null;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (onSubmit && canSubmit && !busy) onSubmit();
  }

  const border = {
    brand: 'border-brand/60',
    danger: 'border-danger/60',
    success: 'border-success/60',
  }[tone];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
    >
      <form
        onSubmit={submit}
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-2xl border ${border} bg-card p-6`}
      >
        <h2 className={`text-xl font-extrabold ${tone === 'danger' ? 'text-danger' : ''}`}>
          {title}
        </h2>
        <div className="mt-3 space-y-3 text-base">{children}</div>
        <div className="mt-3">
          <Status error={error} />
        </div>
        <div className="mt-4 flex gap-2">
          {onSubmit && (
            <SmallButton type="submit" tone={tone} disabled={!canSubmit || busy}>
              {busy ? 'Working…' : submitLabel}
            </SmallButton>
          )}
          <SmallButton variant="outline" tone="muted" onClick={onClose}>
            {onSubmit ? 'Cancel' : 'Close'}
          </SmallButton>
        </div>
      </form>
    </div>
  );
}

// A date as "30 Dec 2026", in the viewer's time zone.
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
