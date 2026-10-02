import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  type AdminGame,
  type StaffGameSummary,
  type StaffLoginResponse,
} from '@magic-potion/shared';
import { BrandingTab } from './pages/BrandingTab';
import { GamesPage } from './pages/GamesPage';
import { SettingsTab } from './pages/SettingsTab';
import { StaffProvider, type StaffApi, type StaffContextValue } from './StaffContext';

// Game data retention on the staff screens: the date in the games list, the warning banner,
// "Delete played game now", and the setting that stays editable after the game starts.

const LOGIN: StaffLoginResponse = {
  token: 't',
  staff: { id: 'admin-1', name: 'Sunny', role: 'MAIN_ADMIN' },
};
const DAY = 24 * 60 * 60 * 1000;
// Midday UTC, so the shown date is the same in every time zone the tests run in.
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

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

function withStaff(ui: ReactNode, value: Partial<StaffContextValue> = {}) {
  const ctx: StaffContextValue = {
    login: LOGIN,
    api: fakeApi(),
    go: vi.fn(),
    freshLogins: null,
    setFreshLogins: vi.fn(),
    ...value,
  };
  return render(<StaffProvider value={ctx}>{ui}</StaffProvider>);
}

function game(patch: Partial<AdminGame> = {}): AdminGame {
  return {
    id: 'g1',
    name: 'Acme offsite',
    phase: 'REVEAL',
    locked: true,
    settings: structuredClone(DEFAULT_SETTINGS),
    teams: [],
    assignments: {},
    dataDeleteAt: iso(Date.UTC(2026, 11, 30, 12)),
    dataDeleteFrom: 'ended',
    introVideoProblem: null,
    ...patch,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('games list: data deletion dates', () => {
  const played = (patch: Partial<StaffGameSummary>): StaffGameSummary => ({
    id: 'g2',
    name: 'March event',
    phase: 'REVEAL',
    started: true,
    finished: true,
    archived: false,
    dataDeleteAt: iso(Date.UTC(2026, 11, 30, 12)),
    dataDeleteFrom: 'ended',
    dataDeleteDays: 90,
    ...patch,
  });

  it('shows when each played game will be deleted', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    const games = [
      played({}),
      played({
        id: 'g3',
        name: 'Never ended',
        phase: 'ROUND2',
        finished: false,
        dataDeleteAt: iso(Date.UTC(2027, 0, 15, 12)),
        dataDeleteFrom: 'last-activity',
      }),
      { id: 'g1', name: 'Dry run', phase: 'LOBBY', started: false, finished: false } as const,
    ];
    withStaff(<GamesPage />, {
      api: fakeApi({ get: vi.fn(async () => games) as StaffApi['get'] }),
    });
    const march = (await screen.findByText('March event')).closest('li')!;
    expect(within(march).getByText('Data will be deleted on 30 Dec 2026')).toBeInTheDocument();
    const never = screen.getByText('Never ended').closest('li')!;
    expect(
      within(never).getByText(
        'Data will be deleted on 15 Jan 2027 (90 days after the last activity)',
      ),
    ).toBeInTheDocument();
    const dry = screen.getByText('Dry run').closest('li')!;
    expect(within(dry).queryByText(/Data will be deleted/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('warns at the top when a game will be deleted within 7 days, archived ones too', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    const games = [
      played({ archived: true, name: 'Old event', dataDeleteAt: iso(NOW + 6 * DAY) }),
      played({ id: 'g4', name: 'Later event', dataDeleteAt: iso(NOW + 8 * DAY) }),
    ];
    withStaff(<GamesPage />, {
      api: fakeApi({ get: vi.fn(async () => games) as StaffApi['get'] }),
    });
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent(
      'Old event will be deleted on 8 Oct 2026. Download its exports first.',
    );
    expect(banner).not.toHaveTextContent('Later event');
  });

  it('deletes a played game now, after the name is typed, with a reminder to export', async () => {
    const del = vi.fn(async () => null);
    const go = vi.fn();
    withStaff(<GamesPage />, {
      go,
      api: fakeApi({
        get: vi.fn(async () => [played({})]) as StaffApi['get'],
        del: del as StaffApi['del'],
      }),
    });
    const march = (await screen.findByText('March event')).closest('li')!;
    fireEvent.click(within(march).getByRole('button', { name: /Delete/ }));
    const dialog = screen.getByRole('dialog', { name: 'Delete played game now' });
    expect(dialog).toHaveTextContent(
      'This deletes all teams, chat, answers, transfers, photos and the audit log of this game for good. Download the exports first.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Download exports' }));
    expect(go).toHaveBeenCalledWith({ page: 'game', gameId: 'g2', tab: 'debrief' });
    const confirm = within(dialog).getByRole('button', { name: 'Delete game' });
    fireEvent.change(within(dialog).getByLabelText('Type the game name to confirm'), {
      target: { value: 'March event' },
    });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(del).toHaveBeenCalledWith('/games/g2', { confirmName: 'March event' }),
    );
  });

  it('offers no Delete for a game still being played', async () => {
    withStaff(<GamesPage />, {
      api: fakeApi({
        get: vi.fn(async () => [
          played({ phase: 'ROUND2', finished: false, dataDeleteFrom: 'last-activity' }),
        ]) as StaffApi['get'],
      }),
    });
    const row = (await screen.findByText('March event')).closest('li')!;
    expect(within(row).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });
});

describe('Delete game data after (days)', () => {
  it('stays editable after the game has started and saves on its own', async () => {
    const put = vi.fn(async () => game({ dataDeleteAt: iso(Date.UTC(2027, 0, 29, 12)) }));
    const onChange = vi.fn();
    withStaff(<SettingsTab game={game()} onChange={onChange} />, {
      api: fakeApi({ put: put as StaffApi['put'] }),
    });
    expect(screen.getByLabelText('Round 1')).toBeDisabled();
    const days = screen.getByLabelText('Delete game data after (days)');
    expect(days).toBeEnabled();
    expect(screen.getByText('Data will be deleted on 30 Dec 2026')).toBeInTheDocument();
    fireEvent.change(days, { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save game data setting' }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/games/g1/data-retention', { days: 120 }),
    );
    expect(onChange).toHaveBeenCalled();
  });

  it('refuses a number outside 7 to 365 without saving', () => {
    const put = vi.fn();
    withStaff(<SettingsTab game={game()} onChange={vi.fn()} />, { api: fakeApi({ put }) });
    fireEvent.change(screen.getByLabelText('Delete game data after (days)'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save game data setting' }));
    expect(screen.getByText('Enter a whole number from 7 to 365.')).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });
});

describe('intro video link', () => {
  it('tells the admin when a saved link is no longer allowed', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.branding.introVideoUrl = 'https://cdn.example.com/intro.mp4';
    withStaff(
      <BrandingTab
        game={game({
          locked: false,
          phase: 'LOBBY',
          settings,
          introVideoProblem:
            'Use a YouTube or Vimeo link, or a video file from our own picture store.',
        })}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        'This intro video link is no longer allowed and will not play. Replace it or clear it.',
      ),
    ).toBeInTheDocument();
  });

  it('refuses a link from another site before saving', () => {
    const put = vi.fn();
    withStaff(<BrandingTab game={game({ locked: false, phase: 'LOBBY' })} onChange={vi.fn()} />, {
      api: fakeApi({ put }),
    });
    fireEvent.change(screen.getByPlaceholderText(/youtube/), {
      target: { value: 'https://cdn.example.com/intro.mp4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save branding' }));
    expect(
      screen.getByText('Use a YouTube or Vimeo link, or a video file from our own picture store.'),
    ).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });
});
