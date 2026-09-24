import type { GameSettings } from './settings';

const minutes = (m: number) => m * 60;

// Defaults from docs/GAME_RULES.md. Admins can change any of these per game.
export const DEFAULT_SETTINGS: GameSettings = {
  branding: {
    clientName: '',
    logoUrl: null,
    primaryColor: '#7c3aed',
    accentColor: '#22d3ee',
  },
  funds: {
    taskFundsStart: 10_000,
    supportFundsStart: 4_500,
  },
  tasks: {
    hintCost: 1_500,
    hintsPerAttempt: 1,
    failPenalty: 3_500,
    lockoutAttempts: 3,
    lockoutSeconds: 60,
    hangmanMaxWrong: 6,
    timerSeconds: {
      vault: minutes(12),
      find_code: minutes(12),
      picture_puzzle: minutes(12),
      hangman: minutes(8),
      spot_difference: minutes(8),
      alien_translator: minutes(12),
      sound_sleuth: minutes(10),
      pictionary: minutes(8),
      escape_room: minutes(15),
      riddle: minutes(8),
      ethical_dilemma: minutes(8),
      data_story: minutes(12),
    },
  },
  phases: {
    round1Seconds: minutes(35),
    pauseSeconds: minutes(10),
    round2Seconds: minutes(35),
  },
  chat: {
    messagesPerRound: 5,
    maxLength: 300,
  },
  transfers: {
    delaySeconds: 60,
  },
  inbox: {
    releaseAtPlaySeconds: [minutes(10), minutes(30), minutes(55)],
    reward: 1_000,
    answerAttempts: 3,
  },
  scoring: {
    pointsPerTask: 10_000,
    timeBonusPerSecond: 5,
    taskFundsMultiplier: 2,
    collaborationMultiplier: 1.5,
    collaborationCap: 10_000,
    receivedMultiplier: 2,
    fullPotionBonus: 15_000,
  },
};
