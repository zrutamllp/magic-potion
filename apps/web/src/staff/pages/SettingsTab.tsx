import { useMemo, useState, type FormEvent } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import { DEFAULT_SETTINGS, type AdminGame } from '@magic-potion/shared';
import {
  FIELD_GROUPS,
  LOCKOUT_KEY,
  fromForm,
  toForm,
  unitLabel,
  type FieldDef,
  type FormErrors,
  type SettingsForm,
} from '../settingsForm';
import { useUnsavedChanges } from '../router';
import { useStaff } from '../StaffContext';
import { Panel, SmallButton, Status, inputBase, useAction } from '../ui';
import type { GameTabProps } from './GamePage';

// Every rule number as a form field, grouped like GAME_RULES.md. Locked once Round 1 starts.

export function SettingsTab({ game, onChange }: GameTabProps) {
  const { api } = useStaff();
  const [form, setForm] = useState<SettingsForm>(() => toForm(game.settings));
  const [errors, setErrors] = useState<FormErrors>({});
  const action = useAction();
  const locked = game.locked;
  const saved = useMemo(() => JSON.stringify(toForm(game.settings)), [game.settings]);
  const dirty = !locked && JSON.stringify(form) !== saved;
  useUnsavedChanges(dirty);

  function setValue(key: string, value: string) {
    setForm((f) => ({ ...f, values: { ...f.values, [key]: value } }));
    action.clear();
  }

  function setLocks(lockoutSeconds: string[]) {
    setForm((f) => ({ ...f, lockoutSeconds }));
    action.clear();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const result = fromForm(game.settings, form);
    if (!result.ok) {
      setErrors(result.errors);
      action.setError('Some fields need fixing. They are marked in red.');
      return;
    }
    setErrors({});
    const updated = await action.run(
      () => api.put<AdminGame>(`/games/${game.id}/settings`, { settings: result.settings }),
      'Settings saved.',
    );
    if (updated) {
      onChange(updated);
      setForm(toForm(updated.settings));
    }
  }

  function resetToDefaults() {
    // Branding stays: only the rule numbers go back to their defaults.
    setForm(toForm({ ...DEFAULT_SETTINGS, branding: game.settings.branding }));
    setErrors({});
    action.clear();
  }

  return (
    <form onSubmit={save}>
      {/* Stays at the top of the window while the fields scroll under it. */}
      <div className="sticky top-0 z-10 -mx-6 mb-4 flex items-center gap-3 border-b border-line bg-page px-6 py-3 shadow-lg shadow-page">
        <SmallButton type="submit" disabled={locked || action.busy}>
          {action.busy ? 'Saving…' : 'Save settings'}
        </SmallButton>
        <SmallButton variant="outline" tone="muted" onClick={resetToDefaults} disabled={locked}>
          <RotateCcw className="h-4 w-4" aria-hidden /> Reset to defaults
        </SmallButton>
        {dirty && !action.error && (
          <p role="status" className="font-semibold text-warning">
            You have unsaved changes
          </p>
        )}
        <Status ok={dirty ? null : action.done} error={action.error} />
      </div>
      {/* Panels flow down and across the full width, like newspaper columns, so there are no
          empty gaps and less scrolling. */}
      <fieldset
        disabled={locked}
        className="columns-1 gap-4 md:columns-2 xl:columns-3 2xl:columns-4"
      >
        {FIELD_GROUPS.map((group) => (
          <Panel key={group.title} title={group.title} className="mb-4 break-inside-avoid">
            <div className="flex flex-col gap-2">
              {group.fields.map((f) => (
                <NumberField
                  key={f.key}
                  field={f}
                  value={form.values[f.key] ?? ''}
                  error={errors[f.key]}
                  onChange={(v) => setValue(f.key, v)}
                />
              ))}
              {group.title === 'Tasks' && (
                <LockLengths
                  values={form.lockoutSeconds}
                  error={errors[LOCKOUT_KEY]}
                  onChange={setLocks}
                />
              )}
            </div>
          </Panel>
        ))}
      </fieldset>
    </form>
  );
}

function NumberField({
  field,
  value,
  error,
  onChange,
}: {
  field: FieldDef;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = `setting-${field.key}`;
  const unit = unitLabel(field.unit);
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold">
          {field.label}
        </label>
        <span className="flex shrink-0 items-center gap-1.5">
          <input
            id={id}
            inputMode="decimal"
            className={`${inputBase} w-20 text-right ${error ? 'border-danger' : ''}`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <span className="w-10 text-sm text-ink-muted">{unit}</span>
        </span>
      </div>
      {field.help && <p className="text-xs text-ink-muted">{field.help}</p>}
      {error && (
        <p id={`${id}-error`} className="text-right text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// The lock lengths after each run of wrong codes: 1st lock, 2nd lock, ... The last one repeats.
function LockLengths({
  values,
  error,
  onChange,
}: {
  values: string[];
  error?: string;
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="mt-1 border-t border-line pt-2">
      <p className="text-sm font-semibold">Code lock lengths</p>
      <p className="text-xs text-ink-muted">1st lock, 2nd lock, … The last one repeats.</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {values.map((v, i) => (
          <span key={i} className="flex items-center gap-1">
            <input
              aria-label={`Lock ${i + 1} length in seconds`}
              inputMode="numeric"
              className={`${inputBase} w-16 text-right ${error ? 'border-danger' : ''}`}
              value={v}
              onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              type="button"
              aria-label={`Remove lock ${i + 1}`}
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="text-ink-muted hover:text-danger"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => onChange([...values, values.at(-1) ?? '60'])}
          className="inline-flex items-center gap-1 text-sm text-brand-soft hover:underline"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add
        </button>
        <span className="text-sm text-ink-muted">sec</span>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
