import type { GameSettings } from './settings';

const minutes = (m: number) => m * 60;

// Defaults from docs/GAME_RULES.md. Admins can change any of these per game.
export const DEFAULT_SETTINGS: GameSettings = {
  branding: {
    clientName: '',
    logoUrl: null,
    primaryColor: '#7c3aed',
    accentColor: '#22d3ee',
    introVideoUrl: null,
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
    // 1st lock 60 seconds, 2nd 2 minutes, 3rd and later 4 minutes.
    lockoutSeconds: [60, 120, 240],
    hangmanMaxWrong: 6,
    picturePuzzleGrid: { rows: 3, cols: 3 },
    // A click this far outside a difference (in % of the image width) still finds it.
    spotDifferenceTolerancePercent: 4,
    // Guess the Celebrity: photos played per try, drawn from the content's photos.
    guessCelebrityFaces: 8,
    // Riddles, Data Story questions and Pictionary drawings per try, drawn from the pool.
    poolPerTry: { riddle: 3, data_story: 3, pictionary: 5 },
    timerSeconds: {
      vault: minutes(12),
      find_code: minutes(12),
      picture_puzzle: minutes(12),
      hangman: minutes(8),
      spot_difference: minutes(8),
      alien_translator: minutes(12),
      guess_celebrity: minutes(8),
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
    photoRetentionDays: 30,
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
  staff: {
    coFacilitatorAdjustLimit: 2_000,
    stuckIdleSeconds: minutes(5),
  },
};
