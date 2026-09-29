import { Plus, Shuffle, Trash2 } from 'lucide-react';
import type { ItemError, PackItemData } from '@magic-potion/shared';
import { AlienSymbol } from '../../player/tasks/alienGlyphs';
import { SmallButton, inputBase } from '../ui';
import { AnswersField, FieldError, NumberInput, TextField, errorAt } from './fields';

// Forms for the tasks whose content is text. Each form edits one pack entry
// ({ publicData, secretData }) and shows the red message of each field.

export interface ItemFormProps {
  value: PackItemData;
  onChange: (value: PackItemData) => void;
  errors: readonly ItemError[];
}

// Typed access to the draft, with defaults for fields not filled in yet.
function parts<P, S>(value: PackItemData) {
  return { pub: (value.publicData ?? {}) as P, sec: (value.secretData ?? {}) as S };
}

// ---------- Riddle ----------

type RiddlePub = { riddle: string };
type RiddleSec = { answers: string[]; clue: string };

export function RiddleForm({ value, onChange, errors }: ItemFormProps) {
  const { pub, sec } = parts<RiddlePub, RiddleSec>(value);
  const set = (p: Partial<RiddlePub>, s: Partial<RiddleSec>) =>
    onChange({ publicData: { ...pub, ...p }, secretData: { ...sec, ...s } });
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Riddle"
        value={pub.riddle ?? ''}
        onChange={(riddle) => set({ riddle }, {})}
        error={errorAt(errors, 'public.riddle')}
        multiline
      />
      <AnswersField
        value={sec.answers ?? []}
        onChange={(answers) => set({}, { answers })}
        error={errorAt(errors, 'secret.answers')}
      />
      <TextField
        label="Clue (the hint)"
        value={sec.clue ?? ''}
        onChange={(clue) => set({}, { clue })}
        error={errorAt(errors, 'secret.clue')}
        help="Shown when the team uses its hint."
      />
    </div>
  );
}

// ---------- Hangman ----------

type HangmanPub = { category: string };
type HangmanSec = { phrase: string };

export function HangmanForm({ value, onChange, errors }: ItemFormProps) {
  const { pub, sec } = parts<HangmanPub, HangmanSec>(value);
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Category (players see it)"
        value={pub.category ?? ''}
        onChange={(category) => onChange({ publicData: { category }, secretData: sec })}
        error={errorAt(errors, 'public.category')}
        placeholder="Office problem"
      />
      <TextField
        label="Phrase (players guess it)"
        value={sec.phrase ?? ''}
        onChange={(phrase) => onChange({ publicData: pub, secretData: { phrase } })}
        error={errorAt(errors, 'secret.phrase')}
        help="Letters, spaces, hyphens and apostrophes. Up to 28 letters, 12 per word."
        placeholder="Printer out of paper"
      />
    </div>
  );
}

// ---------- Ethical Dilemma ----------

type DilemmaPub = { scenario: string; options: string[] };

export function DilemmaForm({ value, onChange, errors }: ItemFormProps) {
  const { pub } = parts<DilemmaPub, object>(value);
  const options = [0, 1, 2, 3].map((i) => pub.options?.[i] ?? '');
  const set = (p: Partial<DilemmaPub>) =>
    onChange({ publicData: { scenario: pub.scenario ?? '', options, ...p }, secretData: {} });
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Scenario"
        value={pub.scenario ?? ''}
        onChange={(scenario) => set({ scenario })}
        error={errorAt(errors, 'public.scenario')}
        multiline
        rows={4}
      />
      <div className="grid grid-cols-2 gap-3">
        {options.map((o, i) => (
          <TextField
            key={i}
            label={`Option ${i + 1}`}
            value={o}
            onChange={(text) => set({ options: options.map((x, j) => (j === i ? text : x)) })}
            error={errorAt(errors, `public.options.${i}`)}
            multiline
            rows={2}
          />
        ))}
      </div>
      <FieldError message={errors.find((e) => e.path === 'public.options')?.message} />
      <p className="text-xs text-ink-muted">
        Any complete answer passes. The choice and the reason are kept for the debrief.
      </p>
    </div>
  );
}

// ---------- The Vault ----------

type VaultPub = { intro: string; clues: { text: string; imageUrl?: string }[] };
type VaultSec = { clueDigits: string[] };

export function VaultForm({ value, onChange, errors }: ItemFormProps) {
  const { pub, sec } = parts<VaultPub, VaultSec>(value);
  const clues = [0, 1, 2].map((i) => pub.clues?.[i] ?? { text: '' });
  const digits = [0, 1, 2].map((i) => sec.clueDigits?.[i] ?? '');
  const set = (p: Partial<VaultPub>, s: Partial<VaultSec>) =>
    onChange({
      publicData: { intro: pub.intro ?? '', clues, ...p },
      secretData: { clueDigits: digits, ...s },
    });
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Introduction"
        value={pub.intro ?? ''}
        onChange={(intro) => set({ intro }, {})}
        error={errorAt(errors, 'public.intro')}
      />
      <p className="text-xs text-ink-muted">
        The code has 6 digits: the answers to these 3 clues, then 3 digits from another team (made
        at game start).
      </p>
      {clues.map((c, i) => (
        <div key={i} className="grid grid-cols-[1fr_7rem] gap-3">
          <TextField
            label={`Clue ${i + 1}`}
            value={c.text}
            onChange={(text) =>
              set({ clues: clues.map((x, j) => (j === i ? { ...x, text } : x)) }, {})
            }
            error={errorAt(errors, `public.clues.${i}`)}
          />
          <TextField
            label="Digit"
            value={digits[i] ?? ''}
            maxLength={1}
            onChange={(d) =>
              set({}, { clueDigits: digits.map((x, j) => (j === i ? d.trim() : x)) })
            }
            error={errorAt(errors, `secret.clueDigits.${i}`) ? 'One digit, 0 to 9.' : undefined}
          />
        </div>
      ))}
    </div>
  );
}

// ---------- Find the Code ----------

type FindPub = { intro: string };
type FindSec = { symbols: string[]; codeLength: { min: number; max: number } };

export function FindCodeForm({ value, onChange, errors }: ItemFormProps) {
  const { pub, sec } = parts<FindPub, FindSec>(value);
  const symbols = sec.symbols ?? [];
  const length = sec.codeLength ?? { min: 6, max: 7 };
  const set = (p: Partial<FindPub>, s: Partial<FindSec>) =>
    onChange({
      publicData: { intro: pub.intro ?? '', ...p },
      secretData: { symbols, codeLength: length, ...s },
    });
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Introduction"
        value={pub.intro ?? ''}
        onChange={(intro) => set({ intro }, {})}
        error={errorAt(errors, 'public.intro')}
      />
      <p className="text-xs text-ink-muted">
        At game start every team gets its own random letter code and its own cipher made from these
        symbols. Part of the key is on screen; the rest is held by another team.
      </p>
      <div className="flex gap-4">
        <NumberInput
          label="Shortest code"
          value={length.min}
          onChange={(min) => set({}, { codeLength: { ...length, min } })}
          error={errorAt(errors, 'secret.codeLength')}
        />
        <NumberInput
          label="Longest code"
          value={length.max}
          onChange={(max) => set({}, { codeLength: { ...length, max } })}
        />
      </div>
      <TextField
        label="Symbols"
        value={symbols.join(' ')}
        onChange={(text) => set({}, { symbols: text.split(/\s+/).filter(Boolean) })}
        error={errorAt(errors, 'secret')}
        help={`Separate symbols with spaces. ${symbols.length} now; at least one per letter of the longest code, all different.`}
        multiline
        rows={2}
      />
    </div>
  );
}

// ---------- Alien Translator ----------

type Pair = { symbol: string; letter: string };
type AlienPub = { message: string[]; legend: Pair[] };
type AlienSec = { answer: string[]; hiddenLegend: Pair[] };

const GLYPH_IDS = Array.from({ length: 26 }, (_, i) => `g${String(i + 1).padStart(2, '0')}`);

// The phrase the message spells, read back from the symbols.
function alienPhrase(pub: AlienPub, sec: AlienSec): string {
  const letterOf = new Map(
    [...(pub.legend ?? []), ...(sec.hiddenLegend ?? [])].map((p) => [p.symbol, p.letter]),
  );
  return (pub.message ?? []).map((s) => (s === ' ' ? ' ' : (letterOf.get(s) ?? '?'))).join('');
}

// Builds the message and legends from a phrase. Letters in `shown` go in the legend on screen;
// the rest are hidden (the first 3 hidden ones are the hint).
function buildAlien(phrase: string, shown: Set<string>, order: string[]) {
  const letters = [...new Set(phrase.toUpperCase().replace(/[^A-Z]/g, ''))];
  const symbolOf = new Map(letters.map((l, i) => [l, order[i % order.length]!]));
  const message = [...phrase.toUpperCase()]
    .filter((ch) => /[A-Z ]/.test(ch))
    .map((ch) => (ch === ' ' ? ' ' : symbolOf.get(ch)!));
  const pairs = letters.map((letter) => ({ symbol: symbolOf.get(letter)!, letter }));
  return {
    message,
    legend: pairs.filter((p) => shown.has(p.letter)),
    hiddenLegend: pairs.filter((p) => !shown.has(p.letter)),
  };
}

export function AlienForm({ value, onChange, errors }: ItemFormProps) {
  const { pub, sec } = parts<AlienPub, AlienSec>(value);
  const phrase = alienPhrase(pub, sec);
  const pairs = [...(pub.legend ?? []), ...(sec.hiddenLegend ?? [])];
  const shown = new Set((pub.legend ?? []).map((p) => p.letter));
  const order = pairs.map((p) => p.symbol);

  function rebuild(nextPhrase: string, nextShown: Set<string>, nextOrder = order) {
    const glyphs = [...nextOrder, ...GLYPH_IDS.filter((g) => !nextOrder.includes(g))];
    const built = buildAlien(nextPhrase, nextShown, glyphs);
    const answer = sec.answer?.length ? sec.answer : [nextPhrase.trim()];
    onChange({
      publicData: { message: built.message, legend: built.legend },
      secretData: {
        answer:
          answer[0]?.toUpperCase() === phrase.trim().toUpperCase()
            ? [nextPhrase.trim(), ...answer.slice(1)]
            : answer,
        hiddenLegend: built.hiddenLegend,
      },
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Message (players translate it)"
        value={phrase}
        onChange={(text) => {
          // New letters start in the legend; the admin ticks which ones to hide.
          const letters = new Set(text.toUpperCase().replace(/[^A-Z]/g, ''));
          const next = new Set(
            [...letters].filter((l) => shown.has(l) || !pairs.some((p) => p.letter === l)),
          );
          rebuild(text.toUpperCase().replace(/[^A-Z ]/g, ''), next);
        }}
        error={errorAt(errors, 'public.message')}
        help="Letters and spaces. Each letter becomes an alien symbol."
      />
      {pairs.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Letters in the legend players see</p>
            <SmallButton
              variant="outline"
              tone="muted"
              onClick={() =>
                rebuild(
                  phrase,
                  shown,
                  [...GLYPH_IDS].sort(() => Math.random() - 0.5),
                )
              }
            >
              <Shuffle className="h-4 w-4" aria-hidden /> New symbols
            </SmallButton>
          </div>
          <p className="text-xs text-ink-muted">
            Untick letters to hide them. Hide at least 3: the hint shows 3 hidden letters.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {pairs.map((p) => (
              <label
                key={p.letter}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${shown.has(p.letter) ? 'border-line' : 'border-warning/60 bg-warning/10'}`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand"
                  checked={shown.has(p.letter)}
                  onChange={() => {
                    const next = new Set(shown);
                    if (next.has(p.letter)) next.delete(p.letter);
                    else next.add(p.letter);
                    rebuild(phrase, next);
                  }}
                  aria-label={`Show ${p.letter} in the legend`}
                />
                <AlienSymbol symbol={p.symbol} size={22} />
                <span className="font-mono font-bold">{p.letter}</span>
              </label>
            ))}
          </div>
          <FieldError
            message={
              errorAt(errors, 'secret.hiddenLegend') ? 'Hide at least 3 letters.' : undefined
            }
          />
        </div>
      )}
      <AnswersField
        value={sec.answer ?? []}
        onChange={(answer) => onChange({ publicData: pub, secretData: { ...sec, answer } })}
        error={errorAt(errors, 'secret.answer')}
        help="The message itself, plus any other spelling you accept. One per line."
        rows={2}
      />
    </div>
  );
}

// ---------- Escape Room ----------

type Stage = { title: string; prompt: string; imageUrl?: string; mirrorText?: string };
type EscapePub = { intro: string; stages: Stage[] };
type EscapeSec = { stages: { answer: string[]; hint: string }[] };

export function EscapeForm({ value, onChange, errors }: ItemFormProps) {
  const { pub, sec } = parts<EscapePub, EscapeSec>(value);
  const stages = [0, 1, 2, 3].map((i) => pub.stages?.[i] ?? { title: '', prompt: '' });
  const secrets = [0, 1, 2, 3].map((i) => sec.stages?.[i] ?? { answer: [], hint: '' });
  const set = (i: number, p: Partial<Stage>, s: Partial<EscapeSec['stages'][number]>) =>
    onChange({
      publicData: {
        intro: pub.intro ?? '',
        stages: stages.map((x, j) => (j === i ? clean({ ...x, ...p }) : x)),
      },
      secretData: { stages: secrets.map((x, j) => (j === i ? { ...x, ...s } : x)) },
    });
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Introduction"
        value={pub.intro ?? ''}
        onChange={(intro) =>
          onChange({ publicData: { intro, stages }, secretData: { stages: secrets } })
        }
        error={errorAt(errors, 'public.intro')}
      />
      {stages.map((st, i) => (
        <fieldset key={i} className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-bold">Stage {i + 1}</legend>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Title"
              value={st.title}
              onChange={(title) => set(i, { title }, {})}
              error={errorAt(errors, `public.stages.${i}.title`)}
            />
            <TextField
              label="Mirror text (optional)"
              value={st.mirrorText ?? ''}
              onChange={(mirrorText) => set(i, { mirrorText }, {})}
              help="Shown back to front, as in a mirror."
            />
          </div>
          <TextField
            className="mt-2"
            label="Puzzle"
            value={st.prompt}
            onChange={(prompt) => set(i, { prompt }, {})}
            error={errorAt(errors, `public.stages.${i}.prompt`)}
            multiline
            rows={2}
          />
          <div className="mt-2 grid grid-cols-2 gap-3">
            <AnswersField
              value={secrets[i]!.answer}
              onChange={(answer) => set(i, {}, { answer })}
              error={errorAt(errors, `secret.stages.${i}.answer`)}
              rows={2}
              help="One per line."
            />
            <TextField
              label="Hint"
              value={secrets[i]!.hint}
              onChange={(hint) => set(i, {}, { hint })}
              error={errorAt(errors, `secret.stages.${i}.hint`)}
              multiline
              rows={2}
            />
          </div>
        </fieldset>
      ))}
    </div>
  );
}

// Optional fields are left out when empty, so the saved content stays tidy.
function clean(stage: Stage): Stage {
  const out: Stage = { title: stage.title, prompt: stage.prompt };
  if (stage.mirrorText) out.mirrorText = stage.mirrorText;
  if (stage.imageUrl) out.imageUrl = stage.imageUrl;
  return out;
}

// ---------- Data Story ----------

type Chart = {
  id: string;
  title: string;
  type: 'bar' | 'line' | 'pie';
  data: { label: string; value: number }[];
};
type DataPub = { title?: string; charts: Chart[]; questions: string[] };
type DataSec = { answers: string[][]; hintChartIds: string[] };

function chartId(title: string, taken: string[]): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'chart';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

export function DataStoryForm({ value, onChange, errors }: ItemFormProps) {
  const { pub, sec } = parts<DataPub, DataSec>(value);
  const charts = pub.charts ?? [];
  const questions = pub.questions ?? [];
  const answers = questions.map((_, i) => sec.answers?.[i] ?? []);
  const hints = questions.map((_, i) => sec.hintChartIds?.[i] ?? charts[0]?.id ?? '');
  const emit = (p: Partial<DataPub>, s: Partial<DataSec>) =>
    onChange({
      publicData: { ...(pub.title ? { title: pub.title } : {}), charts, questions, ...p },
      secretData: { answers, hintChartIds: hints, ...s },
    });
  const setChart = (i: number, c: Partial<Chart>) =>
    emit({ charts: charts.map((x, j) => (j === i ? { ...x, ...c } : x)) }, {});

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Dashboard title (optional)"
        value={pub.title ?? ''}
        onChange={(title) => emit({ title: title || undefined }, {})}
      />
      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">Charts</p>
          <SmallButton
            variant="outline"
            onClick={() =>
              emit(
                {
                  charts: [
                    ...charts,
                    {
                      id: chartId(
                        `chart ${charts.length + 1}`,
                        charts.map((c) => c.id),
                      ),
                      title: '',
                      type: 'bar',
                      data: [{ label: '', value: 0 }],
                    },
                  ],
                },
                {},
              )
            }
          >
            <Plus className="h-4 w-4" aria-hidden /> Add chart
          </SmallButton>
        </div>
        <FieldError message={errors.find((e) => e.path === 'public.charts')?.message} />
        {charts.map((c, i) => (
          <fieldset key={c.id} className="mt-2 rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-bold">Chart {i + 1}</legend>
            <div className="grid grid-cols-[1fr_8rem_auto] items-end gap-2">
              <TextField
                label="Title"
                value={c.title}
                onChange={(title) => setChart(i, { title })}
                error={errorAt(errors, `public.charts.${i}.title`)}
              />
              <div>
                <label className="block text-sm font-semibold" htmlFor={`${c.id}-type`}>
                  Type
                </label>
                <select
                  id={`${c.id}-type`}
                  className={`${inputBase} mt-1 w-full`}
                  value={c.type}
                  onChange={(e) => setChart(i, { type: e.target.value as Chart['type'] })}
                >
                  <option value="bar">Bars</option>
                  <option value="line">Line</option>
                  <option value="pie">Pie</option>
                </select>
              </div>
              <SmallButton
                variant="outline"
                tone="danger"
                onClick={() => emit({ charts: charts.filter((_, j) => j !== i) }, {})}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Remove
              </SmallButton>
            </div>
            <table className="mt-2 w-full text-sm">
              <thead className="text-ink-muted">
                <tr>
                  <th className="text-left font-semibold">Label</th>
                  <th className="text-left font-semibold">Value</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {c.data.map((d, k) => (
                  <tr key={k}>
                    <td className="pr-2 pb-1">
                      <input
                        aria-label={`Chart ${i + 1} label ${k + 1}`}
                        className={`${inputBase} w-full`}
                        value={d.label}
                        onChange={(e) =>
                          setChart(i, {
                            data: c.data.map((x, j) =>
                              j === k ? { ...x, label: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </td>
                    <td className="pr-2 pb-1">
                      <input
                        aria-label={`Chart ${i + 1} value ${k + 1}`}
                        inputMode="decimal"
                        className={`${inputBase} w-28 text-right`}
                        value={String(d.value)}
                        onChange={(e) =>
                          setChart(i, {
                            data: c.data.map((x, j) =>
                              j === k
                                ? { ...x, value: Number(e.target.value.replace(/,/g, '')) || 0 }
                                : x,
                            ),
                          })
                        }
                      />
                    </td>
                    <td className="pb-1">
                      <button
                        type="button"
                        aria-label="Remove row"
                        className="text-ink-muted hover:text-danger"
                        onClick={() => setChart(i, { data: c.data.filter((_, j) => j !== k) })}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              className="mt-1 text-sm text-brand-soft hover:underline"
              onClick={() => setChart(i, { data: [...c.data, { label: '', value: 0 }] })}
            >
              + Add row
            </button>
            <FieldError message={errorAt(errors, `public.charts.${i}.data`)} />
          </fieldset>
        ))}
      </div>
      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">Questions ({questions.length})</p>
          <SmallButton
            variant="outline"
            onClick={() =>
              emit(
                { questions: [...questions, ''] },
                { answers: [...answers, []], hintChartIds: [...hints, charts[0]?.id ?? ''] },
              )
            }
          >
            <Plus className="h-4 w-4" aria-hidden /> Add question
          </SmallButton>
        </div>
        <p className="text-xs text-ink-muted">
          Each try asks some of these (a setting, 3 by default). Add more than that for fresh sets
          on a restart.
        </p>
        <FieldError message={errors.find((e) => e.path === 'public.questions')?.message} />
        {questions.map((q, i) => (
          <fieldset key={i} className="mt-2 rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-bold">Question {i + 1}</legend>
            <div className="grid grid-cols-[1fr_12rem] gap-3">
              <TextField
                label="Question"
                value={q}
                onChange={(text) =>
                  emit({ questions: questions.map((x, j) => (j === i ? text : x)) }, {})
                }
                error={errorAt(errors, `public.questions.${i}`)}
              />
              <div>
                <label className="block text-sm font-semibold" htmlFor={`q${i}-chart`}>
                  Chart to look at (hint)
                </label>
                <select
                  id={`q${i}-chart`}
                  className={`${inputBase} mt-1 w-full ${errorAt(errors, `secret.hintChartIds.${i}`) ? 'border-danger' : ''}`}
                  value={hints[i]}
                  onChange={(e) =>
                    emit({}, { hintChartIds: hints.map((x, j) => (j === i ? e.target.value : x)) })
                  }
                >
                  {charts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title || c.id}
                    </option>
                  ))}
                </select>
                <FieldError message={errorAt(errors, `secret.hintChartIds.${i}`)} />
              </div>
            </div>
            <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-3">
              <AnswersField
                value={answers[i] ?? []}
                onChange={(a) => emit({}, { answers: answers.map((x, j) => (j === i ? a : x)) })}
                error={errorAt(errors, `secret.answers.${i}`)}
                rows={2}
                help="One per line. Thousands commas and case do not matter."
              />
              <SmallButton
                variant="outline"
                tone="danger"
                onClick={() =>
                  emit(
                    { questions: questions.filter((_, j) => j !== i) },
                    {
                      answers: answers.filter((_, j) => j !== i),
                      hintChartIds: hints.filter((_, j) => j !== i),
                    },
                  )
                }
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Remove
              </SmallButton>
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}

export { chartId };
