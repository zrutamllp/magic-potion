import type { InboxKind, TaskKey } from '@magic-potion/shared';

// The sample content pack, so a new game is playable out of the box.
// Media paths under /sample/ are placeholders until the files are added in Phase 5.

export interface SampleTaskContent {
  key: TaskKey;
  variant: number;
  publicData: unknown;
  secretData: unknown;
}

export const SAMPLE_TASK_CONTENT: SampleTaskContent[] = [
  {
    key: 'vault',
    variant: 1,
    publicData: {
      intro: 'Crack the 6-digit code. The 3 clues give 3 of the digits.',
      clues: [
        { text: 'How many legs does a spider have?' },
        { text: 'How many sides does a triangle have?' },
        { text: 'What is 15 minus 9?' },
      ],
    },
    secretData: { clueDigits: ['8', '3', '6'] },
  },
  {
    key: 'find_code',
    variant: 1,
    publicData: {
      intro: 'Decode the secret word with the key below.',
    },
    // Each team gets its own word from this list and its own random cipher.
    secretData: {
      // Everyday words with repeated letters: the visible letters fit many English words,
      // so the word cannot be guessed without the fragment (checked in sampleContent.test.ts).
      words: [
        'hammer',
        'ladder',
        'dinner',
        'summer',
        'puddle',
        'paddle',
        'waffle',
        'bottles',
        'kitten',
        'letters',
        'muffin',
        'pollen',
      ],
      symbols: [
        '★',
        '◆',
        '●',
        '▲',
        '■',
        '✚',
        '☾',
        '✿',
        '♣',
        '♠',
        '♥',
        '☀',
        '☂',
        '✈',
        '⚑',
        '⚓',
        '✦',
        '❖',
        '⬟',
        '⬢',
        '☘',
        '♞',
        '♜',
        '⌘',
        '✪',
        '❄',
      ],
    },
  },
  {
    key: 'picture_puzzle',
    variant: 1,
    publicData: {
      title: 'The Shattered Blueprint',
      imageUrl: '/sample/picture-puzzle.jpg',
      rows: 3,
      cols: 4,
    },
    secretData: {},
  },
  {
    key: 'hangman',
    variant: 1,
    publicData: { category: 'A saying' },
    secretData: { phrase: 'Every cloud has a silver lining' },
  },
  {
    key: 'hangman',
    variant: 2,
    publicData: { category: 'A proverb' },
    secretData: { phrase: 'The early bird catches the worm' },
  },
  {
    key: 'spot_difference',
    variant: 1,
    publicData: {
      leftImageUrl: '/sample/spot-left.jpg',
      rightImageUrl: '/sample/spot-right.jpg',
      width: 800,
      height: 600,
    },
    secretData: {
      areas: [
        { x: 120, y: 90, r: 40 },
        { x: 400, y: 60, r: 40 },
        { x: 680, y: 140, r: 40 },
        { x: 220, y: 320, r: 40 },
        { x: 560, y: 300, r: 40 },
        { x: 150, y: 520, r: 40 },
        { x: 640, y: 500, r: 40 },
      ],
    },
  },
  {
    key: 'alien_translator',
    variant: 1,
    publicData: {
      message: ['⌘', '⍜', '⏚', '⏚', '⏃', '⍟', ' ', '⏚', '⎈', '⎈', '⌬'],
      legend: [
        { symbol: '⌘', letter: 'H' },
        { symbol: '⍜', letter: 'I' },
        { symbol: '⏃', letter: 'E' },
        { symbol: '⍟', letter: 'N' },
      ],
    },
    secretData: {
      answer: ['hidden door'],
      hiddenLegend: [
        { symbol: '⏚', letter: 'D' },
        { symbol: '⎈', letter: 'O' },
        { symbol: '⌬', letter: 'R' },
      ],
    },
  },
  {
    key: 'sound_sleuth',
    variant: 1,
    publicData: {
      audioUrl: '/sample/sound-sleuth.mp3',
      questions: [
        'What colour was the door?',
        'How many people were in the room?',
        'At what hour did the bell ring?',
      ],
    },
    secretData: {
      answers: [['red'], ['four', '4'], ['nine', '9', '9 o clock', "nine o'clock", '9pm', '9 pm']],
      clueTranscripts: [
        '"I pushed open the red door and stepped inside."',
        '"Four of us sat around the table, waiting."',
        '"At nine o\'clock the bell finally rang."',
      ],
    },
  },
  {
    key: 'pictionary',
    variant: 1,
    publicData: {
      drawings: [
        {
          strokes: [
            [
              [50, 30],
              [64, 36],
              [70, 50],
              [64, 64],
              [50, 70],
              [36, 64],
              [30, 50],
              [36, 36],
              [50, 30],
            ],
            [
              [50, 20],
              [50, 8],
            ],
            [
              [50, 80],
              [50, 92],
            ],
            [
              [20, 50],
              [8, 50],
            ],
            [
              [80, 50],
              [92, 50],
            ],
          ],
        },
        {
          strokes: [
            [
              [20, 80],
              [80, 80],
              [80, 45],
              [20, 45],
              [20, 80],
            ],
            [
              [15, 45],
              [50, 15],
              [85, 45],
            ],
            [
              [45, 80],
              [45, 62],
              [55, 62],
              [55, 80],
            ],
          ],
        },
        {
          strokes: [
            [
              [45, 90],
              [45, 60],
            ],
            [
              [55, 90],
              [55, 60],
            ],
            [
              [25, 60],
              [50, 15],
              [75, 60],
              [25, 60],
            ],
          ],
        },
        {
          strokes: [
            [
              [20, 50],
              [40, 35],
              [65, 40],
              [75, 50],
              [65, 60],
              [40, 65],
              [20, 50],
            ],
            [
              [75, 50],
              [90, 38],
              [90, 62],
              [75, 50],
            ],
          ],
        },
        {
          strokes: [
            [
              [50, 10],
              [61, 40],
              [93, 40],
              [67, 58],
              [77, 90],
              [50, 70],
              [23, 90],
              [33, 58],
              [7, 40],
              [39, 40],
              [50, 10],
            ],
          ],
        },
      ],
    },
    secretData: { words: [['sun'], ['house', 'home'], ['tree'], ['fish'], ['star']] },
  },
  {
    key: 'escape_room',
    variant: 1,
    publicData: {
      intro: 'You are locked in the lab. Clear all 4 stages to escape.',
      stages: [
        {
          title: 'Find the key',
          prompt: 'The key is hidden under the thing you sit on. What is it?',
        },
        { title: 'Mirror puzzle', prompt: 'Read this in a mirror: HCTAWPOTS' },
        { title: 'Cipher', prompt: 'Move each letter back by one in the alphabet: DMPDL' },
        {
          title: 'Escape',
          prompt: 'The door code is the number of letters in your last two answers, added up.',
        },
      ],
    },
    secretData: {
      stages: [
        { answer: ['chair', 'a chair', 'the chair', 'seat'], hint: 'Look down.' },
        { answer: ['stopwatch'], hint: 'Read the letters from right to left.' },
        { answer: ['clock'], hint: 'D becomes C.' },
        { answer: ['14', 'fourteen'], hint: 'Count the letters in STOPWATCH and CLOCK.' },
      ],
    },
  },
  {
    key: 'riddle',
    variant: 1,
    publicData: {
      riddles: [
        'What has keys but cannot open locks?',
        'What gets wetter the more it dries?',
        'What has hands but cannot clap?',
      ],
    },
    secretData: {
      answers: [
        ['piano', 'a piano', 'keyboard', 'a keyboard'],
        ['towel', 'a towel'],
        ['clock', 'a clock', 'watch', 'a watch'],
      ],
      clues: ['It makes music.', 'You use it after a shower.', 'It tells the time.'],
    },
  },
  {
    key: 'riddle',
    variant: 2,
    publicData: {
      riddles: [
        'What can you catch but not throw?',
        'What has a neck but no head?',
        'What goes up but never comes down?',
      ],
    },
    secretData: {
      answers: [
        ['cold', 'a cold'],
        ['bottle', 'a bottle'],
        ['age', 'your age', 'my age'],
      ],
      clues: ['You might get one in winter.', 'You can drink from it.', 'It grows every birthday.'],
    },
  },
  {
    key: 'ethical_dilemma',
    variant: 1,
    publicData: {
      scenario:
        'An hour before a big deadline, you find a mistake in a teammate’s part of the report. Fixing it will make the team late. What do you do?',
      options: [
        'Fix it quietly and submit late.',
        'Tell your teammate and agree on what to do.',
        'Submit on time and mention the mistake later.',
        'Tell your manager and let them decide.',
      ],
    },
    secretData: {},
  },
  {
    key: 'data_story',
    variant: 1,
    publicData: {
      charts: [
        {
          id: 'sales',
          title: 'Sales by region (units)',
          type: 'bar',
          data: [
            { label: 'North', value: 420 },
            { label: 'South', value: 310 },
            { label: 'East', value: 280 },
            { label: 'West', value: 350 },
          ],
        },
        {
          id: 'visitors',
          title: 'Website visitors per month (thousands)',
          type: 'line',
          data: [
            { label: 'January', value: 32 },
            { label: 'February', value: 28 },
            { label: 'March', value: 21 },
            { label: 'April', value: 35 },
          ],
        },
        {
          id: 'team',
          title: 'Where the team works (%)',
          type: 'pie',
          data: [
            { label: 'Office', value: 60 },
            { label: 'Remote', value: 40 },
          ],
        },
      ],
      questions: [
        'Which region sold the most units?',
        'In which month were website visitors lowest?',
        'What percent of the team works remotely?',
      ],
    },
    secretData: {
      answers: [['north'], ['march', 'mar'], ['40', '40%', '40 %', 'forty']],
      hintChartIds: ['sales', 'visitors', 'team'],
    },
  },
];

export interface SampleInboxItem {
  kind: InboxKind;
  title: string;
  body: string;
  secretAnswer: string[] | null;
  // Index into settings.inbox.releaseAtPlaySeconds.
  releaseSlot: number;
}

export const SAMPLE_INBOX_ITEMS: SampleInboxItem[] = [
  {
    kind: 'PHOTO',
    title: 'Team photo',
    body: 'Upload a screenshot or phone photo of your whole team.',
    secretAnswer: null,
    releaseSlot: 0,
  },
  {
    kind: 'QUESTION',
    title: 'Quick maths',
    body: 'What is 7 x 8?',
    secretAnswer: ['56', 'fifty six', 'fifty-six'],
    releaseSlot: 1,
  },
  {
    kind: 'QUESTION',
    title: 'Finish the saying',
    body: 'Many hands make light ____.',
    secretAnswer: ['work'],
    releaseSlot: 2,
  },
];
