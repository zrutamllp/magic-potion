import {
  TASK_DEFINITIONS,
  TaskKeySchema,
  UNIQUE_TASKS_PER_TEAM,
  type InboxKind,
  type TaskKey,
} from '@magic-potion/shared';

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
      intro: 'Decode the secret code with the key below.',
    },
    // Each team gets its own random 6- or 7-letter code (no real words) and its own cipher.
    secretData: {
      codeLength: { min: 6, max: 7 },
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
  // Sample images live in apps/web/public/sample/ (SVGs). Phase 6 uploads replace the URLs.
  // The grid size is a game setting (tasks.picturePuzzleGrid).
  {
    key: 'picture_puzzle',
    variant: 1,
    publicData: {
      title: 'Office by the river',
      imageUrl: '/sample/picture-puzzle.svg',
      width: 800,
      height: 600,
    },
    secretData: {},
  },
  // Workplace phrases. The category is shown; the phrase is secret.
  {
    key: 'hangman',
    variant: 1,
    publicData: { category: 'Office problem' },
    secretData: { phrase: 'Printer out of paper' },
  },
  {
    key: 'hangman',
    variant: 2,
    publicData: { category: 'On the calendar' },
    secretData: { phrase: 'Quarterly review meeting' },
  },
  {
    key: 'hangman',
    variant: 3,
    publicData: { category: 'In your inbox' },
    secretData: { phrase: 'Out of office reply' },
  },
  // Hit areas are in image pixels. The right picture changes: clock hands, sun, picture on the
  // wall, flower, mug colour, one pen, notebook colour.
  {
    key: 'spot_difference',
    variant: 1,
    publicData: {
      leftImageUrl: '/sample/spot-left.svg',
      rightImageUrl: '/sample/spot-right.svg',
      width: 800,
      height: 600,
    },
    secretData: {
      areas: [
        { x: 430, y: 105, r: 45 },
        { x: 235, y: 95, r: 40 },
        { x: 650, y: 140, r: 45 },
        { x: 120, y: 290, r: 35 },
        { x: 565, y: 445, r: 40 },
        { x: 705, y: 385, r: 35 },
        { x: 230, y: 520, r: 40 },
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
  // Riddle answers ignore case, spaces, punctuation and "a", "an", "the" (see normalizeLoose).
  {
    key: 'riddle',
    variant: 1,
    publicData: {
      riddles: [
        'I have keys but open no locks. I have space but no room. What am I?',
        'The more you take, the more you leave behind. What are they?',
        'What has many teeth but cannot bite?',
      ],
    },
    secretData: {
      answers: [
        ['keyboard', 'computer keyboard', 'laptop keyboard'],
        ['footsteps', 'steps', 'footprints'],
        ['comb', 'hair comb', 'zip', 'zipper'],
      ],
      clues: ['You type on it.', 'You make them when you walk.', 'You use it on your hair.'],
    },
  },
  {
    key: 'riddle',
    variant: 2,
    publicData: {
      riddles: [
        'What has hands but cannot clap?',
        'What gets wetter the more it dries?',
        'What has 12 months and 52 weeks, but is not a year?',
      ],
    },
    secretData: {
      answers: [
        ['clock', 'watch', 'wall clock', 'wristwatch'],
        ['towel', 'hand towel', 'bath towel'],
        ['calendar', 'wall calendar', 'diary', 'planner'],
      ],
      clues: ['It tells the time.', 'You use it after a bath.', 'It hangs on the office wall.'],
    },
  },
  {
    key: 'riddle',
    variant: 3,
    publicData: {
      riddles: [
        'What has a head and a tail but no body?',
        'What goes up but never comes down?',
        'What has one eye but cannot see?',
      ],
    },
    secretData: {
      answers: [
        ['coin', 'rupee coin', 'one rupee coin'],
        ['age', 'your age', 'my age'],
        ['needle', 'sewing needle', 'storm', 'cyclone'],
      ],
      clues: ['You find it in a wallet.', 'It grows every birthday.', 'A tailor uses it.'],
    },
  },
  // No option is the right one. The choice and reason are saved for the debrief.
  {
    key: 'ethical_dilemma',
    variant: 1,
    publicData: {
      scenario:
        'A colleague you trust tells you in private that they have accepted a job at a competitor and will resign next week. Tomorrow your manager plans to give this colleague the lead role on a six-month client project. Today your manager asks you: "Is there anything I should know before I decide?"',
      options: [
        'Say nothing. It is your colleague’s news to tell.',
        'Tell your manager what you know.',
        'Ask your colleague to tell the manager today, and say nothing yourself.',
        'Tell your manager you have a concern, without giving details.',
      ],
    },
    secretData: {},
  },
  // Answers ignore case, spaces, punctuation and thousands commas (see normalizeLoose).
  {
    key: 'data_story',
    variant: 1,
    publicData: {
      title: 'Sales and delivery, July to September',
      charts: [
        {
          id: 'sales',
          title: 'Sales by region (₹ lakh)',
          type: 'bar',
          data: [
            { label: 'North', value: 42 },
            { label: 'South', value: 58 },
            { label: 'East', value: 31 },
            { label: 'West', value: 47 },
          ],
        },
        {
          id: 'orders',
          title: 'Orders delivered per month',
          type: 'line',
          data: [
            { label: 'Apr', value: 1200 },
            { label: 'May', value: 1350 },
            { label: 'Jun', value: 1100 },
            { label: 'Jul', value: 1500 },
            { label: 'Aug', value: 1650 },
            { label: 'Sep', value: 1720 },
          ],
        },
        {
          id: 'complaints',
          title: 'Customer complaints in September',
          type: 'bar',
          data: [
            { label: 'Late delivery', value: 36 },
            { label: 'Damaged item', value: 14 },
            { label: 'Wrong item', value: 9 },
            { label: 'Billing', value: 6 },
          ],
        },
      ],
      questions: [
        'Which region had the highest sales?',
        'In which month did orders delivered go down from the month before?',
        'How many more complaints were about late delivery than about damaged items?',
      ],
    },
    secretData: {
      answers: [
        ['South', 'South region'],
        ['June', 'Jun'],
        ['22', 'twenty two', 'twenty-two'],
      ],
      hintChartIds: ['sales', 'orders', 'complaints'],
    },
  },
  {
    key: 'data_story',
    variant: 2,
    publicData: {
      title: 'Warehouse operations, this week',
      charts: [
        {
          id: 'packed',
          title: 'Orders packed per day',
          type: 'bar',
          data: [
            { label: 'Mon', value: 320 },
            { label: 'Tue', value: 410 },
            { label: 'Wed', value: 380 },
            { label: 'Thu', value: 290 },
            { label: 'Fri', value: 450 },
            { label: 'Sat', value: 260 },
          ],
        },
        {
          id: 'returns',
          title: 'Returns by reason',
          type: 'bar',
          data: [
            { label: 'Size issue', value: 48 },
            { label: 'Changed mind', value: 30 },
            { label: 'Damaged', value: 17 },
            { label: 'Late', value: 11 },
          ],
        },
        {
          id: 'dispatch',
          title: 'Average dispatch time (hours)',
          type: 'line',
          data: [
            { label: 'Week 35', value: 30 },
            { label: 'Week 36', value: 26 },
            { label: 'Week 37', value: 22 },
            { label: 'Week 38', value: 18 },
          ],
        },
      ],
      questions: [
        'On which day were the fewest orders packed?',
        'How many returns were there in total this week?',
        'By how many hours did average dispatch time fall from Week 35 to Week 38?',
      ],
    },
    secretData: {
      answers: [
        ['Saturday', 'Sat'],
        ['106', 'one hundred six', 'one hundred and six'],
        ['12', 'twelve'],
      ],
      hintChartIds: ['packed', 'returns', 'dispatch'],
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

const COMMON_TASK_KEYS: readonly TaskKey[] = TASK_DEFINITIONS.filter(
  (d) => d.type === 'COMMON',
).map((d) => d.key);

// For hand testing and screenshots: keep the common tasks and only these unique tasks, so every
// team draws them (the draw only uses tasks with content). All content when the list is empty.
export function sampleContentFor(uniqueTasks: readonly TaskKey[] = []): SampleTaskContent[] {
  if (uniqueTasks.length === 0) return SAMPLE_TASK_CONTENT;
  const keep = new Set<TaskKey>([...COMMON_TASK_KEYS, ...uniqueTasks]);
  return SAMPLE_TASK_CONTENT.filter((c) => keep.has(c.key));
}

// Reads "--tasks riddle,hangman,ethical_dilemma" from the command line. Empty when not given.
export function parseTasksArg(argv: readonly string[]): TaskKey[] {
  const i = argv.indexOf('--tasks');
  if (i < 0) return [];
  const keys = (argv[i + 1] ?? '').split(',').filter(Boolean);
  const parsed = keys.map((k) => TaskKeySchema.parse(k));
  const unique = parsed.filter((k) => !COMMON_TASK_KEYS.includes(k));
  if (new Set(unique).size < UNIQUE_TASKS_PER_TEAM) {
    throw new Error(`--tasks needs at least ${UNIQUE_TASKS_PER_TEAM} different unique tasks`);
  }
  return unique;
}
