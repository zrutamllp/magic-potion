import type { Draft } from '../draft';
import type { GameState } from '../state';

// Game alerts in the inbox (GAME_RULES section 7): round start, pause, 5 minutes left and the
// end of play. Each is an ALERT inbox item, saved like any other change, so alerts survive a
// restart and are never posted twice. Facts only (GAME_RULES section 16).

export type AlertKey =
  'ROUND1_START' | 'ROUND1_5MIN' | 'PAUSE_START' | 'ROUND2_START' | 'ROUND2_5MIN' | 'PLAY_OVER';

// "5 minutes left" is posted this long before a round ends, and only in rounds longer than it.
export const WARNING_SECONDS = 5 * 60;

export function duration(seconds: number): string {
  if (seconds % 60 !== 0) return `${seconds} seconds`;
  const m = seconds / 60;
  return m === 1 ? '1 minute' : `${m} minutes`;
}

function alertText(key: AlertKey, s: GameState): { title: string; body: string } {
  const p = s.settings.phases;
  switch (key) {
    case 'ROUND1_START':
      return { title: 'Round 1 has started', body: `Round 1 lasts ${duration(p.round1Seconds)}.` };
    case 'ROUND1_5MIN':
      return { title: '5 minutes left', body: 'Round 1 ends in 5 minutes.' };
    case 'PAUSE_START':
      return {
        title: 'Pause',
        body: `Everything is paused for ${duration(p.pauseSeconds)}. Round 2 starts after the pause.`,
      };
    case 'ROUND2_START':
      return { title: 'Round 2 has started', body: `Round 2 lasts ${duration(p.round2Seconds)}.` };
    case 'ROUND2_5MIN':
      return { title: '5 minutes left', body: 'Round 2 ends in 5 minutes.' };
    case 'PLAY_OVER':
      return { title: 'Play is over', body: 'Time for the reveal.' };
  }
}

export function alertKeyOf(publicData: unknown): string | null {
  const key = (publicData as { alert?: unknown } | null)?.alert;
  return typeof key === 'string' ? key : null;
}

export function hasAlert(s: GameState, key: AlertKey): boolean {
  return Object.values(s.inboxItems).some(
    (i) => i.kind === 'ALERT' && alertKeyOf(i.publicData) === key,
  );
}

export function postAlert(d: Draft, key: AlertKey): void {
  if (hasAlert(d.state, key)) return;
  const item = d.createAlert(key, alertText(key, d.state));
  d.emit({ type: 'alertPosted', itemId: item.id });
}

// The "5 minutes left" alert due in the current round, if any.
export function warningDue(s: GameState): { key: AlertKey; at: number } | null {
  if (s.frozenAt !== null || s.phaseEndsAt === null) return null;
  const round =
    s.phase === 'ROUND1'
      ? { key: 'ROUND1_5MIN' as const, seconds: s.settings.phases.round1Seconds }
      : s.phase === 'ROUND2'
        ? { key: 'ROUND2_5MIN' as const, seconds: s.settings.phases.round2Seconds }
        : null;
  if (!round || round.seconds <= WARNING_SECONDS || hasAlert(s, round.key)) return null;
  return { key: round.key, at: s.phaseEndsAt - WARNING_SECONDS * 1000 };
}
