import { DEFAULT_SETTINGS, type GameSettings } from '@magic-potion/shared';

// Settings for the Demo Game made by the seed script.
// "--short" is for testing by hand: 5-minute rounds, a 1-minute pause and 4-minute task timers
// (so a task fits inside one round), with the inbox tasks released inside that time. Every
// other rule (funds, costs, transfer delay, lock lengths, chat limit, scoring) stays at the
// real defaults.

const minutes = (m: number) => m * 60;

const SHORT_TASK_SECONDS = minutes(4);

export const SHORT_DEMO_SETTINGS: GameSettings = {
  ...structuredClone(DEFAULT_SETTINGS),
  tasks: {
    ...structuredClone(DEFAULT_SETTINGS.tasks),
    timerSeconds: Object.fromEntries(
      Object.keys(DEFAULT_SETTINGS.tasks.timerSeconds).map((k) => [k, SHORT_TASK_SECONDS]),
    ) as GameSettings['tasks']['timerSeconds'],
  },
  phases: {
    round1Seconds: minutes(5),
    pauseSeconds: minutes(1),
    round2Seconds: minutes(5),
  },
  inbox: {
    ...DEFAULT_SETTINGS.inbox,
    // One in Round 1, two in Round 2 (play clock, so the Pause does not count).
    releaseAtPlaySeconds: [minutes(1), minutes(6), minutes(8)],
  },
};

export function demoSettings(short: boolean): GameSettings {
  return structuredClone(short ? SHORT_DEMO_SETTINGS : DEFAULT_SETTINGS);
}

export function describeTiming(s: GameSettings): string {
  const m = (sec: number) => `${sec / 60} min`;
  const p = s.phases;
  const timers = new Set(Object.values(s.tasks.timerSeconds));
  const tasks = timers.size === 1 ? `, task timers ${m([...timers][0] ?? 0)}` : '';
  return `Round 1 ${m(p.round1Seconds)}, Pause ${m(p.pauseSeconds)}, Round 2 ${m(p.round2Seconds)}${tasks}`;
}
