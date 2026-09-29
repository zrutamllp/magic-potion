import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type ProjectorState } from '@magic-potion/shared';
import { Projector, revealSteps } from './Projector';

const TEAMS = ['Owls', 'Foxes', 'Bears', 'Wolves'];

function state(patch: Partial<ProjectorState> = {}): ProjectorState {
  return {
    game: {
      id: 'game-1',
      name: 'Acme offsite',
      phase: 'ROUND1',
      frozen: false,
      timersRunning: true,
      phaseMsLeft: 20 * 60_000,
      playMsRemaining: 55 * 60_000,
      serverNow: 0,
      ended: false,
    },
    branding: { ...DEFAULT_SETTINGS.branding, clientName: 'Acme' },
    potion: { percent: 25, completedTeams: 1, totalTeams: 4, halftime: null },
    finalPotion: null,
    teams: TEAMS.map((name, i) => ({ id: `t${i}`, name, tasksDone: i + 1 })),
    leaderboard: null,
    fullPotionBonus: 15_000,
    ...patch,
  };
}

const rows = [
  { teamId: 't3', name: 'Wolves', rank: 1, tasksDone: 4, score: 60_000 },
  { teamId: 't2', name: 'Bears', rank: 2, tasksDone: 3, score: 50_000 },
  { teamId: 't1', name: 'Foxes', rank: 2, tasksDone: 2, score: 50_000 },
  { teamId: 't0', name: 'Owls', rank: 4, tasksDone: 1, score: 30_000 },
];

function show(s: ProjectorState) {
  return render(<Projector state={s} receivedAt={0} now={0} />);
}

describe('projector in Round 1', () => {
  it('shows every team with tasks x/5, the timer and the potion, and no scores or ranks', () => {
    const { container } = show(state());
    const teams = screen.getByRole('list', { name: 'Teams' });
    expect(within(teams).getAllByRole('listitem')).toHaveLength(4);
    expect(teams).toHaveTextContent('Owls1/5');
    expect(screen.getByLabelText('Time left')).toHaveTextContent('20:00');
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Leaderboard' })).toBeNull();
    expect(container.textContent).not.toMatch(/score|rank|points/i);
  });

  it('says when the admin has paused the game', () => {
    const s = state();
    s.game.frozen = true;
    show(s);
    expect(screen.getByText('Round 1 · Paused')).toBeInTheDocument();
  });
});

describe('projector in Round 2', () => {
  it('ranks the teams with scores', () => {
    const s = state({ leaderboard: { final: false, valid: false, rows } });
    s.game.phase = 'ROUND2';
    show(s);
    const board = screen.getByRole('list', { name: 'Leaderboard' });
    const items = within(board).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('1Wolves60,000');
    expect(items[2]).toHaveTextContent('2Foxes50,000');
  });
});

describe('projector at the Pause', () => {
  it('shows the halftime potion big', () => {
    const s = state({
      potion: {
        percent: 50,
        completedTeams: 2,
        totalTeams: 4,
        halftime: { percent: 50, completedTeams: 2, totalTeams: 4 },
      },
    });
    s.game.phase = 'PAUSE';
    s.game.phaseMsLeft = 9 * 60_000;
    show(s);
    expect(screen.getByLabelText('Halftime potion')).toHaveTextContent('50%');
    expect(screen.getByText('Round 2 starts in 9:00')).toBeInTheDocument();
  });
});

describe('projector at the Reveal', () => {
  function reveal(valid: boolean) {
    const s = state({
      potion: {
        percent: valid ? 100 : 75,
        completedTeams: valid ? 4 : 3,
        totalTeams: 4,
        halftime: { percent: 25, completedTeams: 1, totalTeams: 4 },
      },
      finalPotion: { percent: valid ? 100 : 75, completedTeams: valid ? 4 : 3, totalTeams: 4 },
      leaderboard: { final: true, valid, rows },
    });
    s.game.phase = 'REVEAL';
    s.game.phaseMsLeft = null;
    return show(s);
  }
  const next = () => fireEvent.keyDown(window, { key: ' ' });

  it('has one step for the potions, one for the verdict and one per team', () => {
    expect(revealSteps(4)).toBe(6);
  });

  it('shows halftime and final side by side, then that nobody wins, then last place first', () => {
    reveal(false);
    expect(screen.getByLabelText('At halftime')).toHaveTextContent('25%');
    expect(screen.getByLabelText('At the end')).toHaveTextContent('75%');
    next();
    expect(screen.getByRole('status')).toHaveTextContent('The potion is not full. Nobody wins.');
    expect(screen.getByText('Here are the scores.')).toBeInTheDocument();
    next();
    let shown = within(screen.getByRole('list', { name: 'Final leaderboard' })).getAllByRole(
      'listitem',
    );
    expect(shown).toHaveLength(1);
    expect(shown[0]).toHaveTextContent('Owls');
    next();
    next();
    next();
    shown = within(screen.getByRole('list', { name: 'Final leaderboard' })).getAllByRole(
      'listitem',
    );
    expect(shown.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Wolves'),
      expect.stringContaining('Bears'),
      expect.stringContaining('Foxes'),
      expect.stringContaining('Owls'),
    ]);
    expect(screen.getByText('Step 6 of 6')).toBeInTheDocument();
    // Going back hides the winner again.
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.queryByText('Wolves')).toBeNull();
  });

  it('announces the Full Potion Bonus when the potion is full', () => {
    reveal(true);
    next();
    expect(screen.getByRole('status')).toHaveTextContent('The potion is full!');
    expect(screen.getByText(/Full Potion Bonus of 15,000 points/)).toBeInTheDocument();
  });
});
