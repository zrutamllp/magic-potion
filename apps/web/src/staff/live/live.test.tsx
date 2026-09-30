import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  type AuditRowView,
  type StaffLoginResponse,
  type StaffState,
  type StaffTeamView,
} from '@magic-potion/shared';
import { playerState } from '../../player/test/fixtures';
import { FORBIDDEN } from '../../player/test/forbidden';
import { StaffProvider, type StaffApi, type StaffContextValue } from '../StaffContext';
import { LiveProvider, type LiveView } from './context';
import { AdjustDialog, MessageDialog } from './dialogs';
import { Feeds } from './Feeds';
import { ControlBar } from './LivePage';
import { TeamPanel } from './TeamPanel';
import { TeamTable } from './TeamTable';
import { TeamViewer, VIEW_ONLY } from './TeamViewer';

const ADMIN: StaffLoginResponse = {
  token: 't',
  staff: { id: 'admin-1', name: 'Sunny', role: 'MAIN_ADMIN' },
};
const COFAC: StaffLoginResponse = {
  token: 't',
  staff: { id: 'cofac-1', name: 'Asha', role: 'CO_FACILITATOR' },
};
const NOW = Date.UTC(2026, 8, 29, 10, 0, 0);

function team(patch: Partial<StaffTeamView> = {}): StaffTeamView {
  return {
    id: 'team-1',
    code: 'K7WQP',
    name: 'Owls',
    status: 'ACTIVE',
    online: true,
    taskFunds: 10_000,
    supportFunds: 4_500,
    tasksDone: 1,
    messagesLeft: 4,
    tasks: [
      { id: 'a', name: 'The Vault', type: 'COMMON', status: 'DONE', running: null },
      {
        id: 'b',
        name: 'Find the Code',
        type: 'COMMON',
        status: 'IN_PROGRESS',
        running: { number: 1, msLeft: 300_000, lockMsLeft: 45_000 },
      },
      { id: 'c', name: 'Hangman', type: 'UNIQUE', status: 'FAILED', running: null },
      { id: 'd', name: 'Riddle', type: 'UNIQUE', status: 'NOT_STARTED', running: null },
      { id: 'e', name: 'Data Story', type: 'UNIQUE', status: 'NOT_STARTED', running: null },
    ],
    score: 40_000,
    lastActivityAt: NOW - 3 * 60_000,
    stuck: [],
    neededFragments: [
      {
        id: 'f1',
        kind: 'VAULT',
        holderTeamName: 'Foxes',
        holderOnline: false,
        released: false,
      },
    ],
    photo: null,
    ...patch,
  };
}

function staffState(patch: Partial<StaffState> = {}): StaffState {
  return {
    game: {
      id: 'game-1',
      name: 'Acme offsite',
      phase: 'ROUND1',
      frozen: false,
      timersRunning: true,
      phaseMsLeft: 20 * 60_000,
      playMsRemaining: 55 * 60_000,
      serverNow: NOW,
      ended: false,
    },
    potion: { percent: 25, completedTeams: 1, totalTeams: 4, halftime: null },
    staff: { id: 'admin-1', name: 'Sunny', role: 'MAIN_ADMIN' },
    teams: [
      team(),
      team({
        id: 'team-2',
        name: 'Foxes',
        taskFunds: -500,
        stuck: ['NEGATIVE_FUNDS', 'IDLE'],
        lastActivityAt: NOW - 9 * 60_000,
      }),
    ],
    pendingAdjustments: [],
    limits: { coFacilitatorAdjustLimit: 2_000, stuckIdleSeconds: 300 },
    devTools: false,
    devFragments: null,
    ...patch,
  };
}

function fakeApi(overrides: Partial<StaffApi> = {}): StaffApi {
  const never = vi.fn(() => new Promise<never>(() => {}));
  return {
    get: never,
    post: never,
    put: never,
    patch: never,
    del: never,
    upload: never,
    download: never,
    ...overrides,
  };
}

function renderLive(
  ui: ReactNode,
  opts: { state?: StaffState; api?: StaffApi; login?: StaffLoginResponse } = {},
) {
  const state = opts.state ?? staffState();
  const login = opts.login ?? ADMIN;
  const staff: StaffContextValue = {
    login,
    api: opts.api ?? fakeApi(),
    go: vi.fn(),
    freshLogins: null,
    setFreshLogins: vi.fn(),
  };
  const view: LiveView = {
    gameId: 'game-1',
    state: { ...state, staff: { ...login.staff } },
    receivedAt: 0,
    now: 0,
    serverNow: NOW,
    isAdmin: login.staff.role === 'MAIN_ADMIN',
    auditVersion: 0,
    openTeam: vi.fn(),
    viewAsTeam: vi.fn(),
  };
  const result = render(
    <StaffProvider value={staff}>
      <LiveProvider value={view}>{ui}</LiveProvider>
    </StaffProvider>,
  );
  return { ...result, view, api: staff.api };
}

describe('team table', () => {
  it('shows one row per team with tasks, funds, messages, last action and score', () => {
    renderLive(<TeamTable />);
    const owls = screen.getByRole('row', { name: /Owls/ });
    expect(within(owls).getByLabelText('The Vault: Done')).toBeInTheDocument();
    expect(within(owls).getByLabelText('Find the Code: Locked, 5:00 left')).toBeInTheDocument();
    expect(within(owls).getByLabelText('Hangman: Failed')).toBeInTheDocument();
    expect(owls).toHaveTextContent('1/5');
    expect(owls).toHaveTextContent('10,000');
    expect(owls).toHaveTextContent('3 min ago');
    expect(owls).toHaveTextContent('40,000');
    expect(within(owls).queryByText('Stuck')).toBeNull();
  });

  it('flags a stuck team and says why', () => {
    renderLive(<TeamTable />);
    const foxes = screen.getByRole('row', { name: /Foxes/ });
    expect(within(foxes).getByText('Stuck')).toBeInTheDocument();
    expect(foxes).toHaveTextContent('Task Funds below zero');
    expect(foxes).toHaveTextContent('No action for 5 minutes+');
  });

  it('opens a team when its row is clicked', () => {
    const { view } = renderLive(<TeamTable />);
    fireEvent.click(screen.getByRole('button', { name: /Foxes/ }));
    expect(view.openTeam).toHaveBeenCalledWith('team-2');
  });
});

describe('live controls', () => {
  it('gives the main admin pause, extend, end phase and message buttons', () => {
    renderLive(<ControlBar status="online" onBack={vi.fn()} />);
    for (const name of [/Pause/, /1 min/, /5 min/, /End Round 1/, /Message all/]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Time left in this phase')).toHaveTextContent('20:00');
  });

  it('shows Resume while paused', () => {
    const state = staffState();
    state.game.frozen = true;
    renderLive(<ControlBar status="online" onBack={vi.fn()} />, { state });
    expect(screen.getByRole('button', { name: /Resume/ })).toBeInTheDocument();
    expect(screen.getByText('Round 1 · Paused')).toBeInTheDocument();
  });

  it('asks before ending a phase', async () => {
    const post = vi.fn(async () => ({ ok: true, value: null }));
    renderLive(<ControlBar status="online" onBack={vi.fn()} />, {
      api: fakeApi({ post: post as unknown as StaffApi['post'] }),
    });
    fireEvent.click(screen.getByRole('button', { name: /End Round 1/ }));
    const dialog = screen.getByRole('dialog', { name: 'End Round 1 now?' });
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'End Round 1' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/games/game-1/end-phase', undefined));
  });

  it('extends by 1 or 5 minutes', async () => {
    const post = vi.fn(async () => ({ ok: true, value: null }));
    renderLive(<ControlBar status="online" onBack={vi.fn()} />, {
      api: fakeApi({ post: post as unknown as StaffApi['post'] }),
    });
    fireEvent.click(screen.getByRole('button', { name: /5 min/ }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/games/game-1/extend', { seconds: 300 }),
    );
  });

  it('shows no game controls to a co-facilitator', () => {
    renderLive(<ControlBar status="online" onBack={vi.fn()} />, { login: COFAC });
    expect(screen.queryByRole('button', { name: /Pause|End|Message/ })).toBeNull();
  });
});

describe('team panel', () => {
  it('offers clear lock, stop and remove to the main admin only', () => {
    const t = team();
    const { unmount } = renderLive(<TeamPanel team={t} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Clear lock' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop try' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove from game/ })).toBeInTheDocument();
    unmount();
    renderLive(<TeamPanel team={t} onClose={vi.fn()} />, { login: COFAC });
    expect(screen.queryByRole('button', { name: 'Clear lock' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove from game/ })).toBeNull();
    for (const name of [/Change funds/, /Rename/, /Reset login/, /View as team/, 'Release']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('shows who holds a needed fragment, never its value', () => {
    renderLive(<TeamPanel team={team()} onClose={vi.fn()} />);
    expect(screen.getByText('Held by Foxes (offline)')).toBeInTheDocument();
  });
});

describe('fund change dialog', () => {
  it('sends a take-away as a negative amount with the reason', async () => {
    const post = vi.fn(async () => ({ ok: true, value: { outcome: 'applied' } }));
    const onDone = vi.fn();
    renderLive(<AdjustDialog team={team()} onClose={vi.fn()} onDone={onDone} />, {
      api: fakeApi({ post: post as unknown as StaffApi['post'] }),
    });
    fireEvent.click(screen.getByLabelText('Take away'));
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1,500' } });
    fireEvent.change(screen.getByLabelText('Reason (staff only)'), {
      target: { value: 'Broke a rule' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change funds' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/games/game-1/live/teams/team-1/adjust', {
        amount: -1500,
        reason: 'Broke a rule',
      }),
    );
    expect(onDone).toHaveBeenCalledWith('Owls: Task Funds −1,500.');
  });

  it('tells a co-facilitator that a large change goes for approval', () => {
    renderLive(<AdjustDialog team={team()} onClose={vi.fn()} onDone={vi.fn()} />, {
      login: COFAC,
    });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '2001' } });
    expect(screen.getByText(/Over 2,000: this goes to the main admin/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send for approval' })).toBeInTheDocument();
  });

  it('needs an amount and a reason', () => {
    renderLive(<AdjustDialog team={team()} onClose={vi.fn()} onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '500' } });
    expect(screen.getByRole('button', { name: 'Change funds' })).toBeDisabled();
  });
});

describe('feeds', () => {
  const rows: AuditRowView[] = [
    {
      id: 'r2',
      at: NOW,
      staffName: 'Asha',
      teamName: 'Owls',
      action: 'ADJUST_FUNDS',
      before: { taskFunds: 10_000 },
      after: { taskFunds: 11_000, amount: 1_000 },
      reason: 'Good answer',
      undoneAt: null,
      undoOfId: null,
      canUndo: true,
    },
    {
      id: 'r1',
      at: NOW - 60_000,
      staffName: 'Sunny',
      teamName: null,
      action: 'PAUSE_GAME',
      before: null,
      after: null,
      reason: null,
      undoneAt: null,
      undoOfId: null,
      canUndo: false,
    },
  ];

  it('lists the audit log with Undo only where allowed', async () => {
    const get = vi.fn(async () => rows);
    renderLive(<Feeds feed={[]} />, { api: fakeApi({ get: get as unknown as StaffApi['get'] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Audit' }));
    await screen.findByText(/Changed Task Funds \+1,000/);
    expect(screen.getByText('Paused the game')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Undo/ })).toHaveLength(1);
    expect(get).toHaveBeenCalledWith('/games/game-1/live/audit');
  });

  it('lets the admin approve a co-facilitator request', async () => {
    const post = vi.fn(async () => ({ ok: true, value: null }));
    const state = staffState({
      pendingAdjustments: [
        {
          id: 'req-1',
          teamId: 'team-1',
          teamName: 'Owls',
          amount: 3_000,
          reason: 'Bug cost them a round',
          requestedByName: 'Asha',
          requestedById: 'cofac-1',
          createdAt: NOW,
        },
      ],
    });
    renderLive(<Feeds feed={[]} />, {
      state,
      api: fakeApi({ post: post as unknown as StaffApi['post'] }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approvals (1)' }));
    expect(screen.getByText(/Bug cost them a round/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/games/game-1/live/adjustments/req-1', {
        approve: true,
      }),
    );
  });

  it('shows chat and transfers', () => {
    renderLive(
      <Feeds
        feed={[
          { kind: 'chat', id: 'c1', at: NOW, teamId: 'team-1', teamName: 'Owls', body: 'Hi all' },
          {
            kind: 'transfer',
            id: 't1',
            at: NOW,
            fromTeamId: 'team-1',
            fromTeamName: 'Owls',
            toTeamId: 'team-2',
            toTeamName: 'Foxes',
            amount: 500,
            arrived: false,
          },
        ]}
      />,
    );
    expect(screen.getByText('Hi all')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Transfers' }));
    expect(screen.getByText('Owls sent 500 to Foxes (on the way)')).toBeInTheDocument();
  });
});

describe('team photos', () => {
  const withPhoto = (status: 'ACCEPTED' | 'REJECTED', hasFile = true) =>
    staffState({
      teams: [
        team({ photo: { itemId: 'p1', status, hasFile } }),
        team({ id: 'team-2', name: 'Foxes', photo: null }),
      ],
    });

  // Photos are private: each is shown through a short-lived signed link fetched on demand.
  const linkApi = () =>
    vi.fn(async () => ({ url: '/api/photo/abc.def', expiresAt: 0 })) as unknown as StaffApi['get'];

  it('shows each photo through a signed link and rejects one with a reason', async () => {
    const post = vi.fn(async () => ({ ok: true, value: null }));
    const get = linkApi();
    renderLive(<Feeds feed={[]} />, {
      state: withPhoto('ACCEPTED'),
      api: fakeApi({ post: post as unknown as StaffApi['post'], get }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Photos' }));
    const img = await screen.findByRole('img', { name: 'Team photo of Owls' });
    expect(img.getAttribute('src')).toMatch(/\/api\/photo\/abc\.def$/);
    expect(get).toHaveBeenCalledWith('/games/game-1/live/teams/team-1/photo-link');
    expect(screen.queryByRole('img', { name: /Foxes/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog', { name: 'Reject the photo of Owls?' });
    expect(within(dialog).getByRole('button', { name: 'Reject photo' })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Reason (staff only)'), {
      target: { value: 'Not the whole team' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject photo' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/games/game-1/live/teams/team-1/photo/reject', {
        reason: 'Not the whole team',
      }),
    );
  });

  it('shows a rejected or deleted photo with no Reject button', () => {
    const { unmount } = renderLive(
      <TeamPanel team={withPhoto('REJECTED').teams[0]!} onClose={vi.fn()} />,
    );
    expect(screen.getByText('Rejected: waiting for a new photo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
    unmount();
    renderLive(<TeamPanel team={withPhoto('ACCEPTED', false).teams[0]!} onClose={vi.fn()} />);
    expect(screen.getByText(/Photo deleted/)).toBeInTheDocument();
  });
});

describe('dev tools box', () => {
  const devState = () =>
    staffState({
      devTools: true,
      devFragments: [
        {
          kind: 'VAULT',
          neededByTeamId: 'team-1',
          neededByTeamName: 'Owls',
          holderTeamName: 'Foxes',
          value: '4-2-9',
        },
        {
          kind: 'VAULT',
          neededByTeamId: 'team-2',
          neededByTeamName: 'Foxes',
          holderTeamName: 'Owls',
          value: '7-7-1',
        },
      ],
    });

  it('shows the main admin this team’s fragment values and Finish all 5 tasks', async () => {
    const post = vi.fn(async () => ({ ok: true, value: null }));
    renderLive(<TeamPanel team={team()} onClose={vi.fn()} />, {
      state: devState(),
      api: fakeApi({ post: post as unknown as StaffApi['post'] }),
    });
    const box = screen.getByRole('region', { name: 'Dev tools' });
    expect(box).toHaveTextContent('4-2-9');
    expect(box).not.toHaveTextContent('7-7-1');
    fireEvent.click(within(box).getByRole('button', { name: 'Finish all 5 tasks' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/games/game-1/dev/finish-tasks/team-1'));
  });

  it('is hidden without dev tools, and from co-facilitators', () => {
    const { unmount } = renderLive(<TeamPanel team={team()} onClose={vi.fn()} />);
    expect(screen.queryByRole('region', { name: 'Dev tools' })).toBeNull();
    unmount();
    renderLive(<TeamPanel team={team()} onClose={vi.fn()} />, {
      state: devState(),
      login: COFAC,
    });
    expect(screen.queryByRole('region', { name: 'Dev tools' })).toBeNull();
  });
});

describe('message to all teams', () => {
  it('warns about words the game rules keep out of player text, but still sends', async () => {
    const post = vi.fn(async () => ({ ok: true, value: null }));
    const onDone = vi.fn();
    renderLive(<MessageDialog onClose={vi.fn()} onDone={onDone} />, {
      api: fakeApi({ post: post as unknown as StaffApi['post'] }),
    });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Tip' } });
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Work together and help each other.' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('work together');
    fireEvent.click(screen.getByRole('button', { name: 'Send to all teams' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/games/game-1/live/message', {
      title: 'Tip',
      body: 'Work together and help each other.',
    });
  });
});

describe('view as team', () => {
  const watched = () => ({
    teamId: 'team-1',
    snapshot: { state: playerState(), receivedAt: 0 },
    feed: [],
  });

  it('shows the team its own Home, read only, with no Log out', () => {
    renderLive(
      <TeamViewer teamName="Team 1" watched={watched()} status="online" onClose={vi.fn()} />,
    );
    expect(screen.getByRole('dialog', { name: 'View as Team 1' })).toBeInTheDocument();
    expect(screen.getByText(/as they see it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Log out/ })).toBeNull();
    const text = document.body.textContent ?? '';
    for (const pattern of FORBIDDEN) expect(text).not.toMatch(pattern);
  });

  it('sends nothing when a button is pressed', async () => {
    renderLive(
      <TeamViewer teamName="Team 1" watched={watched()} status="online" onClose={vi.fn()} />,
    );
    const state = playerState();
    const task = state.team.tasks.find((t) => t.status === 'NOT_STARTED');
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(task?.name ?? 'x') })[0]!);
    fireEvent.click(await screen.findByRole('button', { name: 'Start Task' }));
    expect(await screen.findByText(VIEW_ONLY)).toBeInTheDocument();
  });

  it('closes', () => {
    const onClose = vi.fn();
    renderLive(
      <TeamViewer teamName="Team 1" watched={watched()} status="online" onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close team view' }));
    expect(onClose).toHaveBeenCalled();
  });
});
