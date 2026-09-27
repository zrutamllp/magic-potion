import type { GameSettings } from '@magic-potion/shared';

// The Rules tab text, approved by the game designer, with every number read from the game's
// settings. GAME_RULES section 16: facts only. Never tell teams to cooperate, never explain
// the Round 1 / Round 2 difference, never explain Found items. rules.test.ts guards this.

export interface RulesSection {
  title: string;
  // Plain text; **word** is shown in bold.
  paragraphs?: string[];
  bullets?: string[];
}

const n = (value: number) => value.toLocaleString('en-US');

export function minutesText(seconds: number): string {
  if (seconds % 60 !== 0) return `${seconds} seconds`;
  const m = seconds / 60;
  return m === 1 ? '1 minute' : `${m} minutes`;
}

// Short waits read better in seconds: "60 seconds", not "1 minute".
export function secondsText(seconds: number): string {
  return seconds < 120 ? `${seconds} seconds` : minutesText(seconds);
}

// Before a noun, for short waits: "a 60-second lock".
export function shortLengthAdjective(seconds: number): string {
  return seconds < 120 ? `${seconds}-second` : lengthAdjective(seconds);
}

// Before a noun: "a 10-minute pause".
export function lengthAdjective(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60}-minute` : `${seconds}-second`;
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth'];

// "60 seconds the first time, 2 minutes the second time, and 4 minutes each time after that".
export function lockTimesText(lengths: readonly number[]): string {
  if (lengths.length === 1) return `${secondsText(lengths[0] ?? 60)} each time`;
  const parts = lengths.map((s, i) =>
    i === lengths.length - 1
      ? `${secondsText(s)} each time after that`
      : `${secondsText(s)} the ${ORDINALS[i] ?? `${i + 1}th`} time`,
  );
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function times(k: number): string {
  if (k === 1) return 'once';
  if (k === 2) return 'twice';
  return `${n(k)} times`;
}

export function rulesSections(s: GameSettings): RulesSection[] {
  const { phases, tasks, funds, chat, transfers, inbox, scoring } = s;
  const sameRounds = phases.round1Seconds === phases.round2Seconds;
  const hints = tasks.hintsPerAttempt === 1 ? '1 hint' : `${tasks.hintsPerAttempt} hints`;
  return [
    {
      title: 'The goal',
      paragraphs: [
        `Make the Magic Potion. When your team finishes all 5 of its tasks, your share is poured into the potion. If the potion is full at the end, every team gets a bonus of ${n(scoring.fullPotionBonus)} points. If it is not full, nobody wins.`,
      ],
    },
    {
      title: 'Time',
      bullets: [
        sameRounds
          ? `The game has two rounds of ${minutesText(phases.round1Seconds)}, with a ${lengthAdjective(phases.pauseSeconds)} pause in between.`
          : `The game has two rounds (Round 1: ${minutesText(phases.round1Seconds)}, Round 2: ${minutesText(phases.round2Seconds)}), with a ${lengthAdjective(phases.pauseSeconds)} pause in between.`,
        'During the pause everything stops: tasks, chat, funds and the inbox. They carry on in Round 2 with the same time left.',
      ],
    },
    {
      title: 'Your tasks',
      bullets: [
        'Your team has 5 tasks. The Vault and Find the Code are the same for every team. The other 3 are chosen for your team.',
        `Each task you solve is worth ${n(scoring.pointsPerTask)} points.`,
        'Press **Start Task** to begin. The task timer starts then.',
        'You can have only one task open at a time.',
        '**Exit** takes you back to Home. The timer keeps running, and your other tasks stay locked until this task is solved or fails.',
        '**Give up** counts as a fail.',
        `If the timer runs out or you give up, you lose ${n(tasks.failPenalty)} Task Funds. You can try the task again with a new timer.`,
        `The Vault, Find the Code and Escape Room lock after ${n(tasks.lockoutAttempts)} wrong tries: ${lockTimesText(tasks.lockoutSeconds)}.`,
      ],
    },
    {
      title: 'Hints',
      bullets: [
        `You can use ${hints} per try, while the timer is running. A hint costs ${n(tasks.hintCost)}.`,
        'The hint is paid from your Support Funds first. If they are not enough, the rest comes from your Task Funds.',
        'A hint is blocked if it would take your Task Funds below zero.',
      ],
    },
    {
      title: 'Found items',
      paragraphs: [
        "Some tasks can't be solved with what's on your screen alone. Look carefully at what you have and what you're missing.",
      ],
    },
    {
      title: 'Funds',
      bullets: [
        `**Task Funds** start at ${n(funds.taskFundsStart)}. They pay for funds you send to other teams, for fails, and for the part of a hint that Support Funds cannot cover. Task Funds count ${times(scoring.taskFundsMultiplier)} in your score.`,
        `**Support Funds** start at ${n(funds.supportFundsStart)}. They are for hints only and do not count in your score.`,
        `You can send Task Funds to another team. They arrive ${secondsText(transfers.delaySeconds)} after you send them.`,
        'You can ask another team for funds. They can accept or decline.',
        'If your Task Funds go below zero, you cannot start a task until they are back to zero or more.',
      ],
    },
    {
      title: 'Chat',
      bullets: [
        'There is one chat for all teams.',
        `Your team can send ${n(chat.messagesPerRound)} messages in each round, up to ${n(chat.maxLength)} characters each.`,
        'Sending or asking for funds does not use a message.',
      ],
    },
    {
      title: 'Inbox',
      bullets: [
        `${inbox.releaseAtPlaySeconds.length} bonus tasks arrive during the game. Each is worth ${n(inbox.reward)} points.`,
        `One of them is a team photo. The others are short questions, with ${n(inbox.answerAttempts)} tries each.`,
        'The inbox also shows game news, such as when a round starts or 5 minutes are left.',
      ],
    },
    {
      title: 'Leaderboard',
      paragraphs: ["The leaderboard shows your team's progress and score."],
    },
    {
      title: 'Your score',
      bullets: [
        `${n(scoring.pointsPerTask)} for each task you solve`,
        `Time bonus: finish all 5 tasks and get ${n(scoring.timeBonusPerSecond)} points for every second of play left`,
        `Your Task Funds at the end, times ${n(scoring.taskFundsMultiplier)}`,
        `${n(inbox.reward)} for each inbox task you complete`,
        `Funds given: ${scoring.collaborationMultiplier} points for every 1 you give, up to ${n(scoring.collaborationCap)}`,
        `Funds received: minus ${n(scoring.receivedMultiplier)} points for every 1 you receive`,
        `Full Potion Bonus: ${n(scoring.fullPotionBonus)} for every team if the potion is full`,
      ],
    },
  ];
}

// Every word players can read in the Rules tab, for tests.
export function rulesPlainText(s: GameSettings): string {
  return rulesSections(s)
    .flatMap((sec) => [sec.title, ...(sec.paragraphs ?? []), ...(sec.bullets ?? [])])
    .join('\n')
    .replace(/\*\*/g, '');
}
