import type { ComponentType } from 'react';
import type { PackItemData, TaskKey } from '@magic-potion/shared';
import { CelebrityForm, PictionaryForm, PuzzleForm, SpotForm } from './pictureForms';
import {
  AlienForm,
  DataStoryForm,
  DilemmaForm,
  EscapeForm,
  FindCodeForm,
  HangmanForm,
  RiddleForm,
  VaultForm,
  type ItemFormProps,
} from './textForms';

// Which form edits each task's entries, what a new entry starts as, and the one-line label shown
// in the list of entries.

interface TaskForm {
  Form: ComponentType<ItemFormProps>;
  empty: () => PackItemData;
  label: (item: PackItemData) => string;
}

const pub = <T>(item: PackItemData) => (item.publicData ?? {}) as T;
const sec = <T>(item: PackItemData) => (item.secretData ?? {}) as T;

export const TASK_FORMS: Record<TaskKey, TaskForm> = {
  riddle: {
    Form: RiddleForm,
    empty: () => ({ publicData: { riddle: '' }, secretData: { answers: [''], clue: '' } }),
    label: (i) => pub<{ riddle: string }>(i).riddle,
  },
  hangman: {
    Form: HangmanForm,
    empty: () => ({ publicData: { category: '' }, secretData: { phrase: '' } }),
    label: (i) => `${sec<{ phrase: string }>(i).phrase} (${pub<{ category: string }>(i).category})`,
  },
  ethical_dilemma: {
    Form: DilemmaForm,
    empty: () => ({ publicData: { scenario: '', options: ['', '', '', ''] }, secretData: {} }),
    label: (i) => pub<{ scenario: string }>(i).scenario,
  },
  pictionary: {
    Form: PictionaryForm,
    empty: () => ({ publicData: { strokes: [] }, secretData: { word: [''] } }),
    label: (i) => sec<{ word: string[] }>(i).word?.[0] ?? '',
  },
  guess_celebrity: {
    Form: CelebrityForm,
    empty: () => ({ publicData: { imageUrl: '' }, secretData: { names: [''] } }),
    label: (i) => sec<{ names: string[] }>(i).names?.[0] ?? '',
  },
  vault: {
    Form: VaultForm,
    empty: () => ({
      publicData: {
        intro: 'Crack the 6-digit code. The 3 clues give 3 of the digits.',
        clues: [{ text: '' }, { text: '' }, { text: '' }],
      },
      secretData: { clueDigits: ['', '', ''] },
    }),
    label: (i) =>
      pub<{ clues: { text: string }[] }>(i)
        .clues?.map((c) => c.text)
        .join(' · ') ?? '',
  },
  find_code: {
    Form: FindCodeForm,
    empty: () => ({
      publicData: { intro: 'Decode the secret code with the key below.' },
      secretData: {
        codeLength: { min: 6, max: 7 },
        symbols: '★ ◆ ● ▲ ■ ✚ ☾ ✿ ♣ ♠ ♥ ☀ ☂ ✈ ⚑ ⚓ ✦ ❖'.split(' '),
      },
    }),
    label: (i) => pub<{ intro: string }>(i).intro,
  },
  picture_puzzle: {
    Form: PuzzleForm,
    empty: () => ({ publicData: { title: '', imageUrl: '', width: 0, height: 0 }, secretData: {} }),
    label: (i) => pub<{ title: string }>(i).title,
  },
  spot_difference: {
    Form: SpotForm,
    empty: () => ({ publicData: {}, secretData: { areas: [] } }),
    label: (i) => `${sec<{ areas: unknown[] }>(i).areas?.length ?? 0} of 7 differences marked`,
  },
  alien_translator: {
    Form: AlienForm,
    empty: () => ({
      publicData: { message: [], legend: [] },
      secretData: { answer: [], hiddenLegend: [] },
    }),
    label: (i) => sec<{ answer: string[] }>(i).answer?.[0] ?? '',
  },
  escape_room: {
    Form: EscapeForm,
    empty: () => ({
      publicData: { intro: '', stages: [0, 1, 2, 3].map(() => ({ title: '', prompt: '' })) },
      secretData: { stages: [0, 1, 2, 3].map(() => ({ answer: [''], hint: '' })) },
    }),
    label: (i) =>
      pub<{ intro: string }>(i).intro ||
      pub<{ stages: { title: string }[] }>(i)
        .stages?.map((s) => s.title)
        .join(' · ') ||
      '',
  },
  data_story: {
    Form: DataStoryForm,
    empty: () => ({
      publicData: {
        title: '',
        charts: [{ id: 'chart-1', title: '', type: 'bar', data: [{ label: '', value: 0 }] }],
        questions: [''],
      },
      secretData: { answers: [['']], hintChartIds: ['chart-1'] },
    }),
    label: (i) => {
      const p = pub<{ title?: string; questions: string[] }>(i);
      return `${p.title || 'Dashboard'} (${p.questions?.length ?? 0} questions)`;
    },
  },
};

// Before saving: empty lines in answer lists are dropped (answer boxes are one per line), and
// empty optional pictures are left out. The server checks everything again.
export function tidyItem(item: PackItemData): PackItemData {
  return { publicData: item.publicData, secretData: dropEmptyLines(item.secretData) };
}

// Answer lists: accepted answers, names and spellings.
const ANSWER_KEYS = new Set(['answers', 'answer', 'names', 'word']);

function dropEmptyLines(value: unknown, inAnswers = false): unknown {
  if (Array.isArray(value)) {
    if (inAnswers && value.every((v) => typeof v === 'string')) {
      return (value as string[]).map((v) => v.trim()).filter(Boolean);
    }
    return value.map((v) => dropEmptyLines(v, inAnswers));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        dropEmptyLines(v, inAnswers || ANSWER_KEYS.has(k)),
      ]),
    );
  }
  return value;
}
