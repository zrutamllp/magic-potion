import { TASK_DEFINITIONS, type AuditRowView, type GamePhase } from '@magic-potion/shared';
import { money } from '../../lib/time';
import { PHASE_LABEL } from '../../player/layout/Shell';

// Plain-English text for the facilitator dashboard (Phase 6C).

// +1,000 or −1,000 (a real minus sign).
export function signed(n: number): string {
  return n >= 0 ? `+${money(n)}` : `−${money(-n)}`;
}

// "just now", "4 min ago", "1 h 5 min ago". Times are server timestamps.
export function ago(at: number | null, serverNow: number): string {
  if (at === null) return '—';
  const minutes = Math.floor(Math.max(0, serverNow - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h ago` : `${h} h ${m} min ago`;
}

// The idle time setting in words: "30 seconds", "1 minute", "5 minutes".
export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const TASK_NAME = new Map<string, string>(TASK_DEFINITIONS.map((t) => [t.key, t.name]));

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function num(value: unknown, key: string): number | null {
  const v = field(value, key);
  return typeof v === 'number' ? v : null;
}

function str(value: unknown, key: string): string | null {
  const v = field(value, key);
  return typeof v === 'string' ? v : null;
}

function taskOf(row: AuditRowView): string {
  const key = str(row.after, 'task') ?? str(row.before, 'task');
  return key ? (TASK_NAME.get(key) ?? key) : 'a task';
}

function phaseOf(value: unknown): string {
  const phase = str(value, 'phase') as GamePhase | null;
  return phase ? (PHASE_LABEL[phase] ?? phase) : 'the phase';
}

// One line saying what a staff member did.
export function auditText(row: AuditRowView): string {
  switch (row.action) {
    case 'START_GAME':
      return 'Started the game';
    case 'PAUSE_GAME':
      return 'Paused the game';
    case 'RESUME_GAME':
      return 'Resumed the game';
    case 'EXTEND_PHASE': {
      const before = num(row.before, 'phaseEndsAt');
      const after = num(row.after, 'phaseEndsAt');
      const minutes = before !== null && after !== null ? (after - before) / 60_000 : null;
      return minutes !== null
        ? `Added ${minutes} min to ${phaseOf(row.before)}`
        : `Extended ${phaseOf(row.before)}`;
    }
    case 'END_PHASE':
      return `Ended ${phaseOf(row.before)}`;
    case 'ADJUST_FUNDS': {
      const amount = num(row.after, 'amount');
      const approved = str(row.after, 'requestId') !== null;
      return `${approved ? 'Approved a funds change' : 'Changed Task Funds'} ${
        amount !== null ? signed(amount) : ''
      }`.trim();
    }
    case 'REQUEST_ADJUSTMENT': {
      const amount = num(row.after, 'amount');
      return `Asked the admin to change Task Funds ${amount !== null ? signed(amount) : ''}`.trim();
    }
    case 'REJECT_ADJUSTMENT': {
      const amount = num(row.before, 'amount');
      return `Turned down a funds change ${amount !== null ? signed(amount) : ''}`.trim();
    }
    case 'RENAME_TEAM':
      return `Renamed “${str(row.before, 'name') ?? '?'}” to “${str(row.after, 'name') ?? '?'}”`;
    case 'RESET_TEAM_PASSWORD':
      return 'Reset the login (new password)';
    case 'END_TEAM_SESSION':
      return 'Ended the login';
    case 'CLEAR_LOCKOUT':
      return `Cleared the lock on ${taskOf(row)}`;
    case 'STOP_TASK':
      return `Stopped a try of ${taskOf(row)} (no penalty)`;
    case 'RELEASE_FRAGMENT':
      return 'Released a fragment to the team';
    case 'SEND_MESSAGE':
      return `Sent a message: “${str(row.after, 'title') ?? ''}”`;
    case 'REMOVE_TEAM':
      return 'Removed the team from the game';
    case 'REJECT_PHOTO':
      return 'Rejected the team photo';
    case 'UNBLOCK_LOGINS':
      return 'Unblocked team logins (cleared the login limits)';
    case 'UNDO': {
      const amount = num(row.after, 'amount');
      if (str(row.after, 'undid') === 'RENAME_TEAM') {
        return `Undid a rename (back to “${str(row.after, 'name') ?? '?'}”)`;
      }
      return `Undid a funds change ${amount !== null ? signed(amount) : ''}`.trim();
    }
    default:
      return row.action.toLowerCase().replace(/_/g, ' ');
  }
}

// What happens when the admin ends each phase early. Shown before End.
export const END_PHASE_TEXT: Record<GamePhase, { title: string; body: string; label: string }> = {
  LOBBY: {
    title: 'Start the game?',
    body: 'Round 1 starts now for every team. Scoring settings lock.',
    label: 'Start game',
  },
  ROUND1: {
    title: 'End Round 1 now?',
    body: 'The Pause starts at once and the halftime potion is saved. Everything freezes until Round 2.',
    label: 'End Round 1',
  },
  PAUSE: {
    title: 'End the Pause now?',
    body: 'Round 2 starts at once. Task timers, transfers and chat carry on.',
    label: 'End the Pause',
  },
  ROUND2: {
    title: 'End Round 2 now?',
    body: 'Play stops for every team. Running tasks stop with no penalty and do not count. The Reveal starts.',
    label: 'End Round 2',
  },
  REVEAL: {
    title: 'End the game?',
    body: 'Scores are final. Nothing can change after this.',
    label: 'End game',
  },
};
