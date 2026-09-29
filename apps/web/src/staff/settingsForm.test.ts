import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, TASK_KEYS } from '@magic-potion/shared';
import { ALL_FIELDS, FIELD_GROUPS, LOCKOUT_KEY, fromForm, toForm } from './settingsForm';

describe('settings form', () => {
  it('turns the defaults into fields and back without change', () => {
    const result = fromForm(DEFAULT_SETTINGS, toForm(DEFAULT_SETTINGS));
    expect(result).toEqual({ ok: true, settings: DEFAULT_SETTINGS });
  });

  it('shows times in minutes', () => {
    const form = toForm(DEFAULT_SETTINGS);
    expect(form.values['phase.round1']).toBe('35');
    expect(form.values['timer.escape_room']).toBe('15');
    expect(form.values['inbox.release.0']).toBe('10');
    expect(form.values['transfers.delay']).toBe('60');
    expect(form.lockoutSeconds).toEqual(['60', '120', '240']);
  });

  it('has a field for every task timer and every number in the settings', () => {
    for (const key of TASK_KEYS)
      expect(ALL_FIELDS.some((f) => f.key === `timer.${key}`)).toBe(true);
    // Every number except the lock lengths (their own list) and branding.
    expect(ALL_FIELDS).toHaveLength(2 + 3 + 12 + 12 + 3 + 5 + 2 + 7);
    expect(FIELD_GROUPS.find((g) => g.scoring)?.title).toBe('Scoring');
  });

  it('saves minutes as whole seconds and allows thousands commas', () => {
    const form = toForm(DEFAULT_SETTINGS);
    form.values['phase.round1'] = '2.5';
    form.values['funds.task'] = '12,500';
    form.lockoutSeconds = ['30', '90'];
    const result = fromForm(DEFAULT_SETTINGS, form);
    expect(result.ok && result.settings.phases.round1Seconds).toBe(150);
    expect(result.ok && result.settings.funds.taskFundsStart).toBe(12_500);
    expect(result.ok && result.settings.tasks.lockoutSeconds).toEqual([30, 90]);
  });

  it('keeps branding from the base settings', () => {
    const base = {
      ...DEFAULT_SETTINGS,
      branding: { ...DEFAULT_SETTINGS.branding, clientName: 'Acme' },
    };
    const result = fromForm(base, toForm(base));
    expect(result.ok && result.settings.branding.clientName).toBe('Acme');
  });

  it('explains what is wrong, field by field', () => {
    const form = toForm(DEFAULT_SETTINGS);
    form.values['funds.task'] = 'lots';
    form.values['tasks.hintCost'] = '10.5';
    form.values['tasks.puzzleRows'] = '9';
    form.values['phase.pause'] = '0';
    form.values['inbox.release.2'] = '5';
    form.lockoutSeconds = [];
    const result = fromForm(DEFAULT_SETTINGS, form);
    expect(result).toEqual({
      ok: false,
      errors: {
        'funds.task': 'Enter a number.',
        'tasks.hintCost': 'Enter a whole number.',
        'tasks.puzzleRows': 'Enter 6 or less.',
        'phase.pause': 'Enter 0.5 or more.',
        'inbox.release.2': 'Must be the same as bonus task 2 or later.',
        [LOCKOUT_KEY]: 'Add at least one lock length.',
      },
    });
  });

  it('refuses a negative number', () => {
    const form = toForm(DEFAULT_SETTINGS);
    form.values['scoring.potionBonus'] = '-5';
    const result = fromForm(DEFAULT_SETTINGS, form);
    expect(result.ok).toBe(false);
  });
});
