import { useId, type ReactNode } from 'react';
import type { ItemError } from '@magic-potion/shared';
import { inputBase, inputClass } from '../ui';

// Form pieces for pack entries. Every field can show its own red message: the server and the
// shared checks name problems by path ("public.options.1"), and each field knows its path.

// The first message for this path, or for anything inside it.
export function errorAt(errors: readonly ItemError[], path: string): string | undefined {
  return (
    errors.find((e) => e.path === path)?.message ??
    errors.find((e) => e.path.startsWith(`${path}.`))?.message
  );
}

export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-0.5 text-sm text-danger">
      {message}
    </p>
  );
}

export function TextField({
  label,
  value,
  onChange,
  error,
  help,
  placeholder,
  multiline,
  rows = 3,
  maxLength,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  help?: ReactNode;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  className?: string;
}) {
  const id = useId();
  const props = {
    id,
    value,
    placeholder,
    maxLength,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
    className: `${inputClass} mt-1 ${error ? 'border-danger' : ''}`,
  };
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      {multiline ? (
        <textarea rows={rows} {...props} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...props} onChange={(e) => onChange(e.target.value)} />
      )}
      {help && <p className="mt-0.5 text-xs text-ink-muted">{help}</p>}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

// A list of accepted answers, one per line. Empty lines are dropped when saved.
export function AnswersField({
  label = 'Accepted answers',
  value,
  onChange,
  error,
  help = 'One per line. Case, spaces and punctuation do not matter.',
  rows = 3,
}: {
  label?: string;
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
  help?: string;
  rows?: number;
}) {
  return (
    <TextField
      label={label}
      value={value.join('\n')}
      onChange={(text) => onChange(text.split('\n'))}
      error={error}
      help={help}
      multiline
      rows={rows}
    />
  );
}

// The lines of an answers box, trimmed, without empty ones.
export function cleanLines(lines: readonly string[]): string[] {
  return lines.map((l) => l.trim()).filter(Boolean);
}

export function NumberInput({
  label,
  value,
  onChange,
  error,
  className = '',
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  error?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        className={`${inputBase} mt-1 w-28 text-right ${error ? 'border-danger' : ''}`}
        value={Number.isFinite(value) ? String(value) : ''}
        onChange={(e) => onChange(Number(e.target.value.replace(/,/g, '')))}
      />
      <FieldError message={error} />
    </div>
  );
}
