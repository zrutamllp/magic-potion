import { z } from 'zod';

// The 12 tasks from docs/GAME_RULES.md section 3, in rule order.
export const TASK_KEYS = [
  'vault',
  'find_code',
  'picture_puzzle',
  'hangman',
  'spot_difference',
  'alien_translator',
  'sound_sleuth',
  'pictionary',
  'escape_room',
  'riddle',
  'ethical_dilemma',
  'data_story',
] as const;

export const TaskKeySchema = z.enum(TASK_KEYS);
export type TaskKey = z.infer<typeof TaskKeySchema>;

export type TaskType = 'COMMON' | 'UNIQUE';

export interface TaskDefinitionInfo {
  key: TaskKey;
  name: string;
  type: TaskType;
  sortOrder: number;
}

export const TASK_DEFINITIONS: readonly TaskDefinitionInfo[] = [
  { key: 'vault', name: 'The Vault', type: 'COMMON', sortOrder: 1 },
  { key: 'find_code', name: 'Find the Code', type: 'COMMON', sortOrder: 2 },
  { key: 'picture_puzzle', name: 'Picture Puzzle', type: 'UNIQUE', sortOrder: 3 },
  { key: 'hangman', name: 'Hangman', type: 'UNIQUE', sortOrder: 4 },
  { key: 'spot_difference', name: 'Spot the Difference', type: 'UNIQUE', sortOrder: 5 },
  { key: 'alien_translator', name: 'Alien Translator', type: 'UNIQUE', sortOrder: 6 },
  { key: 'sound_sleuth', name: 'Sound Sleuth', type: 'UNIQUE', sortOrder: 7 },
  { key: 'pictionary', name: 'Pictionary', type: 'UNIQUE', sortOrder: 8 },
  { key: 'escape_room', name: 'Escape Room', type: 'UNIQUE', sortOrder: 9 },
  { key: 'riddle', name: 'Riddle', type: 'UNIQUE', sortOrder: 10 },
  { key: 'ethical_dilemma', name: 'Ethical Dilemma', type: 'UNIQUE', sortOrder: 11 },
  { key: 'data_story', name: 'Data Story', type: 'UNIQUE', sortOrder: 12 },
];

// Tasks that lock after too many wrong code attempts (GAME_RULES section 3).
export const LOCKOUT_TASK_KEYS: readonly TaskKey[] = ['vault', 'find_code', 'escape_room'];

// Tasks with no hint (GAME_RULES section 3).
export const NO_HINT_TASK_KEYS: readonly TaskKey[] = ['ethical_dilemma'];
