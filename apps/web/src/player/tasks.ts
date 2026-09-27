import {
  BookOpen,
  Brain,
  Camera,
  DoorOpen,
  Ear,
  FileSearch,
  KeyRound,
  Languages,
  LineChart,
  Palette,
  Puzzle,
  Scale,
  SpellCheck,
  Vault,
  type LucideIcon,
} from 'lucide-react';
import type { TaskKey } from '@magic-potion/shared';
import type { Tone } from './ui/basics';

// How each task looks on its card: an icon, a colour, and one plain line saying what
// players do (from the task list in GAME_RULES section 3). Facts only.

export interface TaskLook {
  icon: LucideIcon;
  tone: Tone;
  summary: string;
}

export const TASK_LOOK: Record<TaskKey, TaskLook> = {
  vault: { icon: Vault, tone: 'warning', summary: 'Crack a 6-digit code.' },
  find_code: { icon: KeyRound, tone: 'info', summary: 'Decode a secret message.' },
  picture_puzzle: { icon: Puzzle, tone: 'info', summary: 'Rebuild a scrambled picture.' },
  hangman: { icon: SpellCheck, tone: 'alert', summary: 'Guess the phrase letter by letter.' },
  spot_difference: { icon: FileSearch, tone: 'success', summary: 'Find 7 differences.' },
  alien_translator: { icon: Languages, tone: 'brand', summary: 'Translate alien symbols.' },
  sound_sleuth: { icon: Ear, tone: 'warning', summary: 'Listen and answer 3 questions.' },
  pictionary: { icon: Palette, tone: 'success', summary: 'Guess 5 words from drawings.' },
  escape_room: { icon: DoorOpen, tone: 'danger', summary: 'Clear 4 stages to escape.' },
  riddle: { icon: Brain, tone: 'brand', summary: 'Answer 3 riddles.' },
  ethical_dilemma: { icon: Scale, tone: 'info', summary: 'Choose an action and give a reason.' },
  data_story: { icon: LineChart, tone: 'alert', summary: 'Read a dashboard, answer 3 questions.' },
};

// Used for the inbox photo task and the Rules tab.
export const ICONS = { camera: Camera, rules: BookOpen };
