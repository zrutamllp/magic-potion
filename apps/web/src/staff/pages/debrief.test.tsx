import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type AdminGame, type DebriefView } from '@magic-potion/shared';
import { StaffProvider, type StaffApi, type StaffContextValue } from '../StaffContext';
import { DebriefTab } from './DebriefTab';

const T0 = Date.UTC(2026, 8, 29, 9, 0, 0);

const game: AdminGame = {
  id: 'g1',
  name: 'Acme Offsite',
  phase: 'REVEAL',
  locked: true,
  settings: structuredClone(DEFAULT_SETTINGS),
  teams: [],
  assignments: {},
};

const debrief: DebriefView = {
  gameName: 'Acme Offsite',
  startedAt: T0,
  potion: {
    halftime: { percent: 25, completedTeams: 1, totalTeams: 4 },
    final: { percent: 75, completedTeams: 3, totalTeams: 4 },
  },
  firstMessages: [
    { teamName: 'Foxes', at: T0 + 2 * 60_000, round: 1, minutesAfterStart: 2 },
    { teamName: 'Owls', at: null, round: null, minutesAfterStart: null },
  ],
  funds: [{ fromTeamName: 'Foxes', toTeamName: 'Owls', amount: 750, transfers: 2 }],
  teamFunds: [
    { teamName: 'Foxes', given: 750, received: 0 },
    { teamName: 'Owls', given: 0, received: 750 },
  ],
  dilemma: [
    { option: 'Tell the client now', answers: [{ teamName: 'Foxes', reason: 'Honesty first' }] },
    { option: 'Wait a week', answers: [] },
  ],
};

function renderTab(api: Partial<StaffApi>) {
  const never = vi.fn(() => new Promise<never>(() => {}));
  const ctx: StaffContextValue = {
    login: { token: 't', staff: { id: 'a', name: 'Sunny', role: 'MAIN_ADMIN' } },
    api: {
      get: never,
      post: never,
      put: never,
      patch: never,
      del: never,
      upload: never,
      download: never,
      ...api,
    },
    go: vi.fn(),
    freshLogins: null,
    setFreshLogins: vi.fn(),
  };
  return render(
    <StaffProvider value={ctx}>
      <DebriefTab game={game} onChange={vi.fn()} />
    </StaffProvider>,
  );
}

describe('debrief', () => {
  it('shows the potion, first messages, funds and dilemma answers by option', async () => {
    renderTab({ get: vi.fn(async () => debrief) as unknown as StaffApi['get'] });
    expect(await screen.findByLabelText('At halftime')).toHaveTextContent('25%');
    expect(screen.getByLabelText('At the end')).toHaveTextContent('75%');
    expect(screen.getByRole('row', { name: 'Owls No message' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Foxes Owls 750 2/ })).toBeInTheDocument();
    expect(screen.getByText('Honesty first')).toBeInTheDocument();
    expect(screen.getByText(/Wait a week/)).toHaveTextContent('0 teams');
  });

  it('downloads each CSV and the zip with the game name in the file name', async () => {
    const download = vi.fn(async () => {});
    renderTab({
      get: vi.fn(async () => debrief) as unknown as StaffApi['get'],
      download,
    });
    const panel = (await screen.findByText('Exports (CSV)')).closest('section')!;
    fireEvent.click(within(panel).getByRole('button', { name: /Final scores/ }));
    await waitFor(() =>
      expect(download).toHaveBeenCalledWith(
        expect.stringMatching(/^\/games\/g1\/exports\/scores\.csv\?tz=/),
        'acme-offsite-scores.csv',
      ),
    );
    fireEvent.click(within(panel).getByRole('button', { name: /Download all/ }));
    await waitFor(() =>
      expect(download).toHaveBeenLastCalledWith(
        expect.stringMatching(/^\/games\/g1\/exports\/all\.zip\?tz=/),
        'acme-offsite-all.zip',
      ),
    );
    expect(within(panel).getAllByRole('button')).toHaveLength(7);
  });

  it('says when the debrief is not open yet', async () => {
    renderTab({
      get: vi.fn(async () => {
        throw new Error('The debrief and exports open at the Reveal, when the scores are final.');
      }) as unknown as StaffApi['get'],
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('open at the Reveal');
  });
});
