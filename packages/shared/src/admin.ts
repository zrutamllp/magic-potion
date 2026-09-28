import { z } from 'zod';
import type { GamePhase, StaffRole } from './enums';
import { GameSettingsSchema, MAX_TEAMS, MIN_TEAMS, type GameSettings } from './settings';

// Admin panel requests and replies (Phase 6A). The server checks every body with these schemas.

const name = z.string().trim().min(1).max(60);

export const CreateGameSchema = z.object({
  name,
  clientName: z.string().trim().max(100).default(''),
  teamCount: z.number().int().min(MIN_TEAMS).max(MAX_TEAMS),
});
export type CreateGame = z.infer<typeof CreateGameSchema>;

export const RenameGameSchema = z.object({ name });

export const SaveSettingsSchema = z.object({ settings: GameSettingsSchema });

export const AddTeamsSchema = z.object({
  count: z.number().int().min(1).max(MAX_TEAMS),
  // Optional names, in order. Teams without one are called "Team 7" and so on.
  names: z.array(z.string().trim().max(40)).max(MAX_TEAMS).default([]),
});
export type AddTeams = z.infer<typeof AddTeamsSchema>;

export const RenameTeamSchema = z.object({ name: z.string().trim().min(1).max(40) });

// No team ids: reset every team in the game.
export const ResetPasswordsSchema = z.object({ teamIds: z.array(z.string()).optional() });

export const StaffPasswordSchema = z.string().min(8).max(128);

export const CreateStaffSchema = z.object({
  name,
  email: z.email().trim().max(254),
  password: StaffPasswordSchema,
});
export type CreateStaff = z.infer<typeof CreateStaffSchema>;

export const UpdateStaffSchema = z.object({
  name: name.optional(),
  active: z.boolean().optional(),
});

export const ResetStaffPasswordSchema = z.object({ password: StaffPasswordSchema });

export const SetAssignmentsSchema = z.object({
  staffUserId: z.string().min(1),
  teamIds: z.array(z.string().min(1)).max(MAX_TEAMS),
});

// ---------- Replies ----------

export interface AdminTeam {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'REMOVED';
}

// A team login, shown to staff only once: when the team is created or its password is reset.
export interface TeamLoginCard {
  code: string;
  name: string;
  password: string;
}

export interface AdminGame {
  id: string;
  name: string;
  phase: GamePhase;
  // True once Round 1 has started: settings can no longer change, teams can no longer be added.
  locked: boolean;
  settings: GameSettings;
  teams: AdminTeam[];
  // staffUserId -> team ids.
  assignments: Record<string, string[]>;
}

export interface CreatedGame {
  game: AdminGame;
  logins: TeamLoginCard[];
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
}

// ---------- Login generators ----------

// Letters and digits that cannot be mixed up when read aloud or off a screen (no 0/O, 1/I/L).
export const TEAM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const TEAM_CODE_LENGTH = 5;

// Short, common, friendly words for team passwords, so they are easy to read out over Zoom.
// prettier-ignore
export const PASSWORD_WORDS = [
  'apple', 'amber', 'arrow', 'bamboo', 'basil', 'beach', 'berry', 'bird', 'blue', 'bread',
  'brick', 'brook', 'cable', 'candy', 'cedar', 'chalk', 'cherry', 'cloud', 'clover', 'coral',
  'corn', 'cotton', 'daisy', 'delta', 'dune', 'eagle', 'earth', 'ember', 'fern', 'field',
  'flame', 'flint', 'forest', 'frost', 'garden', 'ginger', 'glass', 'grape', 'green', 'harbor',
  'hazel', 'honey', 'island', 'ivory', 'jade', 'jungle', 'kite', 'lake', 'lemon', 'lily',
  'lotus', 'mango', 'maple', 'marble', 'meadow', 'melon', 'mint', 'moon', 'moss', 'nutmeg',
  'ocean', 'olive', 'orange', 'orbit', 'otter', 'panda', 'paper', 'peach', 'pearl', 'pepper',
  'pine', 'planet', 'plum', 'pond', 'quartz', 'rain', 'river', 'robin', 'rocket', 'rose',
  'sage', 'sand', 'silver', 'sky', 'snow', 'spark', 'star', 'stone', 'sugar', 'sun',
  'tiger', 'tulip', 'valley', 'violet', 'water', 'wave', 'willow', 'wind', 'yellow', 'zebra',
] as const;

// randomInt(max) returns a whole number from 0 to max - 1. The server passes crypto.randomInt,
// the browser a crypto.getRandomValues version, tests a fixed sequence.
export type RandomInt = (max: number) => number;

export function generateTeamCode(randomInt: RandomInt): string {
  let code = '';
  for (let i = 0; i < TEAM_CODE_LENGTH; i++) {
    code += TEAM_CODE_ALPHABET[randomInt(TEAM_CODE_ALPHABET.length)];
  }
  return code;
}

// `count` new codes that are all different and not in `taken` (compared without case).
export function generateTeamCodes(
  count: number,
  taken: Iterable<string>,
  randomInt: RandomInt,
): string[] {
  const used = new Set([...taken].map((c) => c.toUpperCase()));
  const codes: string[] = [];
  // 31^5 is about 28 million codes, so a clash is rare; the cap only guards a broken random source.
  for (let tries = 0; codes.length < count; tries++) {
    if (tries > count * 1000) throw new Error('Could not make enough unique team codes.');
    const code = generateTeamCode(randomInt);
    if (used.has(code)) continue;
    used.add(code);
    codes.push(code);
  }
  return codes;
}

// For example "plum-river-sun-4".
export function generateTeamPassword(randomInt: RandomInt): string {
  const words = Array.from({ length: 3 }, () => PASSWORD_WORDS[randomInt(PASSWORD_WORDS.length)]);
  return `${words.join('-')}-${2 + randomInt(8)}`;
}

// The login sheet as CSV, for a spreadsheet or mail merge.
export function loginSheetCsv(gameName: string, playUrl: string, logins: TeamLoginCard[]): string {
  const cell = (value: string) => {
    // A leading = + - @ would make a spreadsheet run the cell as a formula.
    const v = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const rows = [
    ['Game', 'Team', 'Team code', 'Password', 'Play at'],
    ...logins.map((l) => [gameName, l.name, l.code, l.password, playUrl]),
  ];
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
