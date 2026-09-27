import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FeedItem, PlayerState } from '@magic-potion/shared';
import { Shell } from './layout/Shell';
import { PlayerApp } from './PlayerApp';
import { FORBIDDEN } from './test/forbidden';
import { Chat } from './screens/Chat';
import { Funds } from './screens/Funds';
import { Home } from './screens/Home';
import { Inbox } from './screens/Inbox';
import { Leaderboard } from './screens/Leaderboard';
import { Lobby, videoEmbed } from './screens/Lobby';
import { PauseScreen } from './screens/PauseScreen';
import { Reveal } from './screens/Reveal';
import { TaskScreen } from './screens/TaskScreen';
import { playerState, renderGame, task } from './test/fixtures';

const round2Board: PlayerState['leaderboard'] = {
  final: false,
  valid: false,
  rows: [
    {
      teamId: 'team-2',
      name: 'Team 2',
      rank: 1,
      tasksDone: 3,
      taskFunds: 8_000,
      score: 50_000,
      potionShare: 0,
    },
    {
      teamId: 'team-1',
      name: 'Team 1',
      rank: 2,
      tasksDone: 1,
      taskFunds: 10_000,
      score: 30_000,
      potionShare: 0,
    },
    {
      teamId: 'team-3',
      name: 'Team 3',
      rank: 3,
      tasksDone: 0,
      taskFunds: 9_000,
      score: 18_000,
      potionShare: 0,
    },
  ],
};

describe('login', () => {
  it('shows the server message when the login is wrong', async () => {
    window.sessionStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'That team code or password is not right.' }), {
            status: 401,
          }),
      ),
    );
    render(<PlayerApp />);
    fireEvent.change(screen.getByLabelText('Team code'), { target: { value: 'TEAM1' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That team code or password is not right.',
    );
    expect(window.sessionStorage.getItem('mp.team')).toBeNull();
  });
});

describe('top bar', () => {
  it('shows the team, timer, funds and score, and no rank in Round 1', () => {
    renderGame(
      <Shell onLogOut={() => undefined}>
        <p>content</p>
      </Shell>,
    );
    const bar = screen.getByRole('banner');
    expect(within(bar).getByText('Team 1')).toBeInTheDocument();
    expect(within(bar).getByLabelText('Time left')).toHaveTextContent('20:00');
    expect(within(bar).getByText('30,000')).toBeInTheDocument();
    expect(within(bar).queryByText('Rank')).toBeNull();
    expect(within(bar).queryByText(/#\d/)).toBeNull();
  });

  it('shows the rank in Round 2', () => {
    const state = playerState({ leaderboard: round2Board });
    state.game = { ...state.game, phase: 'ROUND2' };
    renderGame(
      <Shell onLogOut={() => undefined}>
        <p>content</p>
      </Shell>,
      { state },
    );
    expect(within(screen.getByRole('banner')).getByText('#2')).toBeInTheDocument();
  });

  it('has one navigation with all six tabs and the potion', () => {
    renderGame(
      <Shell onLogOut={() => undefined}>
        <p>content</p>
      </Shell>,
    );
    const [sidebar] = screen.getAllByRole('navigation', { name: 'Main' });
    for (const tab of ['Home', 'Chat', 'Funds', 'Inbox', 'Leaderboard', 'Rules']) {
      expect(within(sidebar!).getByRole('button', { name: new RegExp(tab) })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('img', { name: 'Magic Potion 25% full' }).length).toBeGreaterThan(0);
  });
});

describe('Home', () => {
  it('shows 5 task cards with status, tag, timer and points', () => {
    renderGame(<Home />);
    expect(screen.getByText('1 of 5 done')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'The Vault: Not started' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find the Code: Done' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hangman: Failed' })).toBeInTheDocument();
    expect(screen.getAllByText('10,000 points')).toHaveLength(5);
    expect(screen.getAllByText('Common')).toHaveLength(2);
    expect(screen.getAllByText('12 min').length).toBeGreaterThan(0);
  });

  it('shows the running timer and why other tasks cannot start', () => {
    const state = playerState();
    state.team = {
      ...state.team,
      tasks: state.team.tasks.map((t) =>
        t.key === 'riddle'
          ? {
              ...t,
              status: 'IN_PROGRESS',
              running: { number: 1, msLeft: 125_000, lockMsLeft: 0, hintsUsed: 0, view: {} },
            }
          : t,
      ),
    };
    renderGame(<Home />, { state });
    expect(screen.getByRole('button', { name: 'Riddle: In progress' })).toHaveTextContent('2:05');
    expect(screen.getAllByText('Another task is open. Finish it first.')).toHaveLength(3);
  });

  it('blocks starting tasks while Task Funds are below zero', () => {
    const state = playerState();
    state.team = { ...state.team, taskFunds: -500 };
    renderGame(<Home />, { state });
    expect(
      screen.getAllByText('Your Task Funds are below zero. You cannot start a task.'),
    ).toHaveLength(4);
  });

  it('shows Found items with the value only', () => {
    renderGame(<Home />);
    expect(screen.getByText('Fragment: 4-2-9')).toBeInTheDocument();
    const section = screen.getByText('Found items').closest('section')!;
    expect(section.textContent).toBe('Found itemsFound itemFragment: 4-2-9');
  });
});

describe('task screen', () => {
  it('starts a task through the server', () => {
    const { send } = renderGame(<TaskScreen taskId="task-vault" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Task' }));
    expect(send).toHaveBeenCalledWith('task:start', { taskId: 'task-vault' });
  });

  it('disables Start while another task is open', () => {
    const state = playerState();
    state.team = {
      ...state.team,
      tasks: [
        task({ id: 'a' }),
        task({
          id: 'b',
          key: 'riddle',
          name: 'Riddle',
          status: 'IN_PROGRESS',
          running: { number: 1, msLeft: 60_000, lockMsLeft: 0, hintsUsed: 0, view: {} },
        }),
      ],
    };
    renderGame(<TaskScreen taskId="a" />, { state });
    expect(screen.getByRole('button', { name: 'Start Task' })).toBeDisabled();
  });

  it('asks before giving up, then gives up through the server', () => {
    const state = playerState();
    state.team = {
      ...state.team,
      tasks: [
        task({
          status: 'IN_PROGRESS',
          running: { number: 1, msLeft: 300_000, lockMsLeft: 0, hintsUsed: 0, view: {} },
        }),
      ],
    };
    const { send, go } = renderGame(<TaskScreen taskId="task-vault" />, { state });
    expect(screen.getByLabelText('Task time left')).toHaveTextContent('5:00');
    fireEvent.click(screen.getByRole('button', { name: 'Give up' }));
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, give up' }));
    expect(send).toHaveBeenCalledWith('task:giveUp', { taskId: 'task-vault' });
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(go).toHaveBeenCalledWith({ tab: 'home' });
  });
});

describe('Chat', () => {
  const feed: FeedItem[] = [
    { kind: 'chat', id: 'c1', at: 1, teamId: 'team-2', teamName: 'Team 2', body: 'Hello' },
    { kind: 'chat', id: 'c2', at: 2, teamId: 'team-1', teamName: 'Team 1', body: 'Hi back' },
    {
      kind: 'transfer',
      id: 't1',
      at: 3,
      fromTeamId: 'team-1',
      fromTeamName: 'Team 1',
      toTeamId: 'team-2',
      toTeamName: 'Team 2',
      amount: 500,
      arrived: false,
    },
  ];

  it('shows messages, transfer lines and messages left, and sends', () => {
    const { send } = renderGame(<Chat />, { feed });
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Team 1 (you)')).toBeInTheDocument();
    expect(screen.getByText(/Team 1 sent 500 to Team 2 \(on the way\)/)).toBeInTheDocument();
    expect(screen.getByText('Messages left: 3 of 5')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Ready' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(send).toHaveBeenCalledWith('chat:send', { body: 'Ready' });
  });

  it('blocks the send box when no messages are left', () => {
    const state = playerState({ chat: { messagesLeft: 0, messagesPerRound: 5, maxLength: 300 } });
    renderGame(<Chat />, { state });
    expect(screen.getByLabelText('Message')).toBeDisabled();
    expect(screen.getByPlaceholderText('No messages left this round')).toBeInTheDocument();
  });
});

describe('Funds', () => {
  it('shows both wallets, a pending transfer and answers a request', () => {
    const state = playerState({
      pendingTransfers: [
        {
          id: 't',
          direction: 'out',
          otherTeamId: 'team-2',
          otherTeamName: 'Team 2',
          amount: 500,
          msLeft: 45_000,
        },
      ],
      pendingRequests: [
        {
          id: 'r',
          direction: 'incoming',
          otherTeamId: 'team-3',
          otherTeamName: 'Team 3',
          amount: 300,
        },
      ],
    });
    const { send } = renderGame(<Funds />, { state });
    expect(screen.getByText('Task Funds')).toBeInTheDocument();
    expect(screen.getByText('Support Funds')).toBeInTheDocument();
    expect(screen.getByText('For hints only')).toBeInTheDocument();
    expect(screen.getByText('Arriving in 0:45')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(send).toHaveBeenCalledWith('funds:accept', { requestId: 'r' });
    expect(screen.queryByText(/Add Funds|Power-Ups|Earned today/i)).toBeNull();
  });
});

describe('Inbox', () => {
  it('shows bonus questions with tries left, and alerts', () => {
    const state = playerState({
      inbox: [
        {
          id: 'a1',
          kind: 'ALERT',
          title: 'Round 1 has started',
          body: 'Round 1 lasts 35 minutes.',
          publicData: {},
          done: false,
          attemptsLeft: null,
          photoStatus: null,
        },
        {
          id: 'q1',
          kind: 'QUESTION',
          title: 'Quick question',
          body: 'What is 2 + 2?',
          publicData: {},
          done: false,
          attemptsLeft: 2,
          photoStatus: null,
        },
      ],
    });
    const { send } = renderGame(<Inbox />, { state });
    expect(screen.getByText('Bonus tasks done: 0 of 3')).toBeInTheDocument();
    expect(screen.getByText('Round 1 has started')).toBeInTheDocument();
    expect(screen.getByText('Tries left: 2 of 3')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Answer for Quick question'), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(send).toHaveBeenCalledWith('inbox:answer', { itemId: 'q1', answer: '4' });
  });
});

describe('Leaderboard', () => {
  it('shows only the own row and no rank in Round 1', () => {
    renderGame(<Leaderboard />);
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.queryByText('Rank')).toBeNull();
  });

  it('shows every team ranked in Round 2', () => {
    renderGame(<Leaderboard />, { state: playerState({ leaderboard: round2Board }) });
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getByText('1st')).toBeInTheDocument();
  });
});

describe('Lobby, Pause and Reveal', () => {
  it('Lobby: welcome, waiting, rules, and the intro video when set', () => {
    const state = playerState({ leaderboard: null });
    state.game = { ...state.game, phase: 'LOBBY', phaseMsLeft: null };
    state.branding = { ...state.branding, introVideoUrl: 'https://youtu.be/dQw4w9WgXcQ' };
    renderGame(<Lobby onLogOut={() => undefined} />, { state });
    expect(screen.getByText('Waiting for the facilitator to start')).toBeInTheDocument();
    expect(screen.getByText('The goal')).toBeInTheDocument();
    expect(screen.getByTitle('Introduction video')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });

  it('turns video links into players', () => {
    expect(videoEmbed('https://www.youtube.com/watch?v=abcdefgh')).toEqual({
      kind: 'iframe',
      src: 'https://www.youtube-nocookie.com/embed/abcdefgh',
    });
    expect(videoEmbed('https://vimeo.com/123456').kind).toBe('iframe');
    expect(videoEmbed('https://cdn.example.com/intro.mp4')).toEqual({
      kind: 'video',
      src: 'https://cdn.example.com/intro.mp4',
    });
  });

  it('Pause: the potion and the countdown only', () => {
    const state = playerState({ leaderboard: null });
    state.game = { ...state.game, phase: 'PAUSE', timersRunning: false, phaseMsLeft: 8 * 60_000 };
    renderGame(<PauseScreen />, { state });
    expect(screen.getByRole('img', { name: 'Magic Potion 25% full' })).toBeInTheDocument();
    expect(screen.getByText('8:00')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByText(/Task Funds|Chat|Leaderboard/)).toBeNull();
  });

  it('Reveal: halftime and final side by side, and "Nobody wins" when not full', () => {
    const state = playerState({
      potion: {
        percent: 50,
        completedTeams: 2,
        totalTeams: 4,
        halftime: { percent: 25, completedTeams: 1, totalTeams: 4 },
      },
      leaderboard: { ...round2Board!, final: true, valid: false },
    });
    state.game = { ...state.game, phase: 'REVEAL', phaseMsLeft: null };
    renderGame(<Reveal />, { state });
    expect(screen.getByText('At halftime')).toBeInTheDocument();
    expect(screen.getByText('At the end')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Magic Potion 25% full' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Magic Potion 50% full' })).toBeInTheDocument();
    expect(screen.getByText('The potion is not full. Nobody wins.')).toBeInTheDocument();
    expect(screen.getByText('Final leaderboard')).toBeInTheDocument();
  });

  it('Reveal: celebrates a full potion with the bonus', () => {
    const state = playerState({
      potion: {
        percent: 100,
        completedTeams: 4,
        totalTeams: 4,
        halftime: { percent: 50, completedTeams: 2, totalTeams: 4 },
      },
      leaderboard: { ...round2Board!, final: true, valid: true },
    });
    state.game = { ...state.game, phase: 'REVEAL', phaseMsLeft: null };
    renderGame(<Reveal />, { state });
    expect(screen.getByText('The potion is full!')).toBeInTheDocument();
    expect(
      screen.getByText('Every team gets the Full Potion Bonus of 15,000 points.'),
    ).toBeInTheDocument();
  });
});

describe('player-facing text (GAME_RULES section 16)', () => {
  it('no screen tells teams to cooperate or explains the rounds', () => {
    const state = playerState({
      pendingRequests: [
        {
          id: 'r',
          direction: 'incoming',
          otherTeamId: 'team-3',
          otherTeamName: 'Team 3',
          amount: 300,
        },
      ],
    });
    const screens = [
      <Home />,
      <Chat />,
      <Funds />,
      <Inbox />,
      <Leaderboard />,
      <TaskScreen taskId="task-vault" />,
    ];
    for (const ui of screens) {
      const { container, unmount } = renderGame(ui, { state });
      for (const pattern of FORBIDDEN) expect(container.textContent).not.toMatch(pattern);
      unmount();
    }
  });
});
