import {
  TaskKeySchema,
  isPoolTask,
  parseTaskContent,
  type PackItemData,
  type TaskKey,
} from '@magic-potion/shared';
import { SAMPLE_TASK_CONTENT } from './sampleContent';

// The built-in Sample pack (Phase 6B): the sample content as pack items, with extra riddles,
// phrases, dilemmas and Data Story questions so every pool has more than one try's worth.
// It is read-only in the admin panel; admins copy it and edit the copy.

export const SAMPLE_PACK_NAME = 'Sample pack';
export const SAMPLE_PACK_DESCRIPTION =
  'Ready-made content for every task. Copy it to make your own pack, then edit the copy.';

export interface SampleItem extends PackItemData {
  taskKey: TaskKey;
}

const EXTRA_RIDDLES: { riddle: string; answers: string[]; clue: string }[] = [
  {
    riddle: 'What can you catch but not throw?',
    answers: ['cold', 'a cold', 'common cold'],
    clue: 'People get it more in winter.',
  },
  {
    riddle: 'What has a neck but no head?',
    answers: ['bottle', 'a bottle', 'water bottle'],
    clue: 'Water often comes in one.',
  },
  {
    riddle: 'What building has the most stories?',
    answers: ['library', 'a library', 'public library'],
    clue: 'It is full of books.',
  },
];

const EXTRA_PHRASES: { category: string; phrase: string }[] = [
  { category: 'At the office', phrase: 'Team lunch' },
  { category: 'Office kitchen', phrase: 'Coffee machine' },
  { category: 'In your inbox', phrase: 'Weekly status report' },
  { category: 'Online meeting', phrase: 'You are on mute' },
  { category: 'Office event', phrase: 'Fire drill' },
];

const EXTRA_DILEMMAS: { scenario: string; options: string[] }[] = [
  {
    scenario:
      'Your team missed a deadline because of a mistake you made. Your manager thinks another department caused the delay and has not asked you about it.',
    options: [
      'Tell your manager it was your mistake.',
      'Say nothing, since nobody asked.',
      'Fix the problem quietly and make sure it does not happen again.',
      'Speak to the other department first, then decide.',
    ],
  },
  {
    scenario:
      'A teammate has been working late every night for weeks and looks exhausted. They ask you not to mention it to anyone.',
    options: [
      'Keep it to yourself, as they asked.',
      'Tell your manager you are worried about them.',
      'Offer to take some of their work.',
      'Encourage them to raise it with the manager themselves.',
    ],
  },
  {
    scenario:
      'While you are choosing between two suppliers, one of them offers you expensive tickets to a concert.',
    options: [
      'Accept them. It will not change your choice.',
      'Decline politely.',
      'Accept them and tell your manager.',
      'Ask your manager what to do before you answer.',
    ],
  },
  {
    scenario:
      'In a meeting, a colleague presents an idea you gave them last week as if it were their own.',
    options: [
      'Say nothing in the meeting and raise it with them later.',
      'Point out in the meeting that it was your idea.',
      'Let it go. The company gains either way.',
      'Tell your manager after the meeting.',
    ],
  },
];

// More questions about the first sample dashboard (sales, orders, complaints), so each try can
// draw 3 of 10.
const EXTRA_DATA_QUESTIONS: { question: string; answers: string[]; chart: string }[] = [
  {
    question: 'Which region had the lowest sales?',
    answers: ['East', 'East region'],
    chart: 'sales',
  },
  {
    question: 'What were the sales of North and West added up (₹ lakh)?',
    answers: ['89', 'eighty nine', 'eighty-nine'],
    chart: 'sales',
  },
  {
    question: 'How many orders were delivered in September?',
    answers: ['1720', '1,720'],
    chart: 'orders',
  },
  {
    question: 'Which kind of complaint was the least common?',
    answers: ['Billing', 'Billing complaints'],
    chart: 'complaints',
  },
  {
    question: 'How many complaints were there in September in all?',
    answers: ['65', 'sixty five', 'sixty-five'],
    chart: 'complaints',
  },
  {
    question: 'By how many did orders delivered go up from August to September?',
    answers: ['70', 'seventy'],
    chart: 'orders',
  },
  {
    question: 'In which month were the most orders delivered?',
    answers: ['September', 'Sep', 'Sept'],
    chart: 'orders',
  },
];

function parsed<K extends TaskKey>(key: K) {
  return SAMPLE_TASK_CONTENT.filter((c) => c.key === key)
    .sort((a, b) => a.variant - b.variant)
    .map((c) => parseTaskContent(key, c));
}

export function samplePackItems(): SampleItem[] {
  const items: SampleItem[] = [];
  const add = (taskKey: TaskKey, publicData: unknown, secretData: unknown) =>
    items.push({ taskKey, publicData, secretData });

  for (const c of parsed('riddle')) {
    c.publicData.riddles.forEach((riddle, i) =>
      add('riddle', { riddle }, { answers: c.secretData.answers[i], clue: c.secretData.clues[i] }),
    );
  }
  for (const r of EXTRA_RIDDLES)
    add('riddle', { riddle: r.riddle }, { answers: r.answers, clue: r.clue });

  for (const c of parsed('hangman')) {
    c.publicData.categories.forEach((category, i) =>
      add('hangman', { category }, { phrase: c.secretData.phrases[i] }),
    );
  }
  for (const p of EXTRA_PHRASES) add('hangman', { category: p.category }, { phrase: p.phrase });

  for (const c of parsed('ethical_dilemma')) add('ethical_dilemma', c.publicData, {});
  for (const d of EXTRA_DILEMMAS) add('ethical_dilemma', d, {});

  for (const c of parsed('pictionary')) {
    c.publicData.drawings.forEach((d, i) =>
      add('pictionary', { strokes: d.strokes }, { word: c.secretData.words[i] }),
    );
  }

  for (const c of parsed('guess_celebrity')) {
    for (const face of c.publicData.faces) {
      add('guess_celebrity', { imageUrl: face.imageUrl }, { names: c.secretData.names[face.id] });
    }
  }

  parsed('data_story').forEach((c, v) => {
    if (v !== 0) {
      add('data_story', c.publicData, c.secretData);
      return;
    }
    add(
      'data_story',
      {
        ...c.publicData,
        questions: [...c.publicData.questions, ...EXTRA_DATA_QUESTIONS.map((q) => q.question)],
      },
      {
        answers: [...c.secretData.answers, ...EXTRA_DATA_QUESTIONS.map((q) => q.answers)],
        hintChartIds: [...c.secretData.hintChartIds, ...EXTRA_DATA_QUESTIONS.map((q) => q.chart)],
      },
    );
  });

  // Every other task: each sample variant is one item, as saved.
  for (const c of SAMPLE_TASK_CONTENT) {
    const key = TaskKeySchema.parse(c.key);
    if (isPoolTask(key) || key === 'data_story') continue;
    if (key === 'spot_difference') {
      // Both sample pictures have the same size.
      const pub = c.publicData as { width: number; height: number };
      add(key, { ...pub, rightWidth: pub.width, rightHeight: pub.height }, c.secretData);
      continue;
    }
    add(key, c.publicData, c.secretData);
  }
  return items;
}

export function samplePackOptions() {
  const celeb = parsed('guess_celebrity')[0];
  return { guessCelebrityTaskName: celeb?.publicData.taskName ?? 'Guess the Celebrity' };
}
