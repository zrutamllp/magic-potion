import type {
  DebriefDilemmaOption,
  DebriefFirstMessage,
  DebriefFundsLine,
  DebriefTeamFunds,
  DebriefView,
} from '@magic-potion/shared';
import type { GameEngine } from '../engine/engine';
import { potionPercent } from '../engine/potion';
import type { GameContent, GameState } from '../engine/state';
import { dilemmaAnswer } from '../engine/views';

// The facilitator's debrief (Phase 6D). Pure functions over the game state.

const byName = <T extends { teamName: string }>(a: T, b: T) =>
  a.teamName.localeCompare(b.teamName, undefined, { numeric: true });

const teamName = (s: GameState, id: string) => s.teams[id]?.name ?? 'A team';

// The chat is one channel for every team, so a team's first message is its first message to
// the other teams.
export function firstMessages(s: GameState): DebriefFirstMessage[] {
  return Object.values(s.teams)
    .map((t) => {
      const first = s.chat.find((m) => m.teamId === t.id);
      return {
        teamName: t.name,
        at: first?.createdAt ?? null,
        round: first?.round ?? null,
        minutesAfterStart:
          first && s.startedAt !== null
            ? Math.floor((first.createdAt - s.startedAt) / 60_000)
            : null,
      };
    })
    .sort((a, b) => {
      if (a.at === null || b.at === null)
        return a.at === null ? (b.at === null ? byName(a, b) : 1) : -1;
      return a.at - b.at;
    });
}

// Who sent funds to whom: arrived transfers only (the same ones the score counts).
export function fundsFlow(s: GameState): { lines: DebriefFundsLine[]; teams: DebriefTeamFunds[] } {
  const pairs = new Map<string, DebriefFundsLine>();
  const given = new Map<string, number>();
  const received = new Map<string, number>();
  for (const t of Object.values(s.transfers)) {
    if (t.arrivedAt === null) continue;
    const key = `${t.fromTeamId}>${t.toTeamId}`;
    const line = pairs.get(key) ?? {
      fromTeamName: teamName(s, t.fromTeamId),
      toTeamName: teamName(s, t.toTeamId),
      amount: 0,
      transfers: 0,
    };
    line.amount += t.amount;
    line.transfers += 1;
    pairs.set(key, line);
    given.set(t.fromTeamId, (given.get(t.fromTeamId) ?? 0) + t.amount);
    received.set(t.toTeamId, (received.get(t.toTeamId) ?? 0) + t.amount);
  }
  const lines = [...pairs.values()].sort(
    (a, b) => b.amount - a.amount || a.fromTeamName.localeCompare(b.fromTeamName),
  );
  const teams = Object.values(s.teams)
    .map((t) => ({
      teamName: t.name,
      given: given.get(t.id) ?? 0,
      received: received.get(t.id) ?? 0,
    }))
    .sort(byName);
  return { lines, teams };
}

export interface DilemmaRow {
  teamName: string;
  option: string;
  reason: string;
}

export function dilemmaRows(s: GameState, content: GameContent): DilemmaRow[] {
  return Object.values(s.teams)
    .flatMap((t) =>
      Object.values(t.tasks).flatMap((task) => {
        const answer = dilemmaAnswer(content, task);
        return answer ? [{ teamName: t.name, ...answer }] : [];
      }),
    )
    .sort(byName);
}

// Answers grouped by the option chosen, every option listed in the scenario's order.
export function dilemmaByOption(s: GameState, content: GameContent): DebriefDilemmaOption[] {
  const rows = dilemmaRows(s, content);
  const scenario = content.byKey.ethical_dilemma?.[0]?.publicData as
    { options?: string[] } | undefined;
  const options = [...(scenario?.options ?? [])];
  for (const r of rows) if (!options.includes(r.option)) options.push(r.option);
  return options.map((option) => ({
    option,
    answers: rows
      .filter((r) => r.option === option)
      .map(({ teamName: name, reason }) => ({ teamName: name, reason })),
  }));
}

export function buildDebrief(engine: GameEngine): DebriefView {
  const s = engine.state;
  const snap = (kind: 'HALFTIME' | 'FINAL') => {
    const p = s.potionSnapshots[kind];
    return p ? { percent: potionPercent(p), ...p } : null;
  };
  const funds = fundsFlow(s);
  return {
    gameName: s.name,
    startedAt: s.startedAt,
    potion: { halftime: snap('HALFTIME'), final: snap('FINAL') },
    firstMessages: firstMessages(s),
    funds: funds.lines,
    teamFunds: funds.teams,
    dilemma: dilemmaByOption(s, engine.gameContent),
  };
}
