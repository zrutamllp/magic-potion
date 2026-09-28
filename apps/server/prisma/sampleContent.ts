import {
  TASK_DEFINITIONS,
  TaskKeySchema,
  UNIQUE_TASKS_PER_TEAM,
  type InboxKind,
  type TaskKey,
} from '@magic-potion/shared';
import { SAMPLE_DRAWINGS } from './sampleDrawings';

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
  // Symbols are ids of the alien glyphs drawn by the web app (apps/web/src/player/tasks/
  // alienGlyphs.tsx). Any other symbol is shown as text. The message reads
  // THE PURPLE MOON RISES AT DAWN; ' ' is a gap between words. The hint gives the first 3
  // hidden pairs (P, U, L).
  {
    key: 'alien_translator',
    variant: 1,
    publicData: {
      message: [
        'g07',
        'g14',
        'g03',
        ' ',
        'g05',
        'g16',
        'g21',
        'g05',
        'g12',
        'g03',
        ' ',
        'g23',
        'g10',
        'g10',
        'g25',
        ' ',
        'g21',
        'g09',
        'g18',
        'g03',
        'g18',
        ' ',
        'g01',
        'g07',
        ' ',
        'g19',
        'g01',
        'g02',
        'g25',
      ],
      legend: [
        { symbol: 'g07', letter: 'T' },
        { symbol: 'g14', letter: 'H' },
        { symbol: 'g03', letter: 'E' },
        { symbol: 'g21', letter: 'R' },
        { symbol: 'g10', letter: 'O' },
        { symbol: 'g18', letter: 'S' },
        { symbol: 'g01', letter: 'A' },
        { symbol: 'g25', letter: 'N' },
      ],
    },
    secretData: {
      answer: ['the purple moon rises at dawn', 'purple moon rises at dawn'],
      hiddenLegend: [
        { symbol: 'g05', letter: 'P' },
        { symbol: 'g16', letter: 'U' },
        { symbol: 'g12', letter: 'L' },
        { symbol: 'g23', letter: 'M' },
        { symbol: 'g09', letter: 'I' },
        { symbol: 'g19', letter: 'D' },
        { symbol: 'g02', letter: 'W' },
      ],
    },
  },
  // Placeholder faces labelled Sample 1 to 8, so the task can be tested before real photos are
  // added. File names are random and never contain the person's name.
  {
    key: 'guess_celebrity',
    variant: 1,
    publicData: {
      taskName: 'Guess the Celebrity',
      faces: [
        { id: 'face-1', imageUrl: '/sample/faces/12a1173ba2.svg' },
        { id: 'face-2', imageUrl: '/sample/faces/6afcee46f9.svg' },
        { id: 'face-3', imageUrl: '/sample/faces/0608b2a753.svg' },
        { id: 'face-4', imageUrl: '/sample/faces/08a6337778.svg' },
        { id: 'face-5', imageUrl: '/sample/faces/758551c75d.svg' },
        { id: 'face-6', imageUrl: '/sample/faces/96c3a97de9.svg' },
        { id: 'face-7', imageUrl: '/sample/faces/f4975b5ad3.svg' },
        { id: 'face-8', imageUrl: '/sample/faces/303364df23.svg' },
      ],
    },
    secretData: {
      names: {
        'face-1': ['sample one', 'sample 1'],
        'face-2': ['sample two', 'sample 2'],
        'face-3': ['sample three', 'sample 3'],
        'face-4': ['sample four', 'sample 4'],
        'face-5': ['sample five', 'sample 5'],
        'face-6': ['sample six', 'sample 6'],
        'face-7': ['sample seven', 'sample 7'],
        'face-8': ['sample eight', 'sample 8'],
      },
    },
  },
  // Line drawings from apps/server/prisma/sampleDrawings.ts. Guesses are forgiving (case,
  // spaces, punctuation, a/an/the, simple plurals).
  {
    key: 'pictionary',
    variant: 1,
    publicData: { drawings: SAMPLE_DRAWINGS },
    secretData: {
      words: [
        ['key'],
        ['cup', 'mug', 'coffee cup', 'coffee mug', 'tea cup', 'teacup', 'coffee'],
        ['light bulb', 'lightbulb', 'bulb', 'bulb light'],
        ['laptop', 'computer', 'notebook'],
        ['rocket', 'rocket ship', 'spaceship', 'space ship'],
      ],
    },
  },
  // 4 linked stages: each answer leads to the next. Mirror text is drawn flipped on screen.
  {
    key: 'escape_room',
    variant: 1,
    publicData: {
      intro: 'You are locked in the lab. Clear all 4 stages to escape.',
      stages: [
        {
          title: 'Find the key',
          prompt:
            "The key is in one of three drawers. Drawer A: 'The key is not here.' Drawer B: 'The key is in drawer A.' Drawer C: 'The key is not in drawer B.' Only one note is true. Which drawer has the key?",
        },
        {
          title: 'Mirror puzzle',
          prompt: 'Drawer B holds a note. Read it in a mirror. What colour is the folder?',
          mirrorText: 'THE CARD IS IN THE BLUE FOLDER',
        },
        {
          title: 'Cipher',
          prompt:
            'The blue folder holds a card. Each letter is one step after the real letter (B means A). Decode it: TFWFO',
        },
        {
          title: 'Escape',
          prompt:
            "The door keypad needs a number: the number on the card, times the number of letters in the folder's colour.",
        },
      ],
    },
    secretData: {
      stages: [
        {
          answer: ['b', 'drawer b'],
          hint: 'Try each drawer in turn. Count how many notes would be true.',
        },
        { answer: ['blue'], hint: 'Read each line from right to left.' },
        { answer: ['seven', '7'], hint: 'T means S.' },
        { answer: ['28', 'twenty eight', 'twenty-eight'], hint: 'The colour BLUE has 4 letters.' },
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
