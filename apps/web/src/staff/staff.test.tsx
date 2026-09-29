import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  type AdminGame,
  type StaffLoginResponse,
  type TeamLoginCard,
} from '@magic-potion/shared';
import { loginSheetHtml, mergeLogins } from './loginSheet';
import { SettingsTab } from './pages/SettingsTab';
import { TeamsTab } from './pages/TeamsTab';
import { UNSAVED_MESSAGE, confirmLeave, parseStaffHash, staffHash } from './router';
import { StaffLogin } from './StaffApp';
import { StaffProvider, type StaffApi, type StaffContextValue } from './StaffContext';

const LOGIN: StaffLoginResponse = {
  token: 't',
  staff: { id: 'admin-1', name: 'Sunny', role: 'MAIN_ADMIN' },
};

function game(patch: Partial<AdminGame> = {}): AdminGame {
  return {
    id: 'g1',
    name: 'Acme offsite',
    phase: 'LOBBY',
    locked: false,
    settings: structuredClone(DEFAULT_SETTINGS),
    teams: [
      { id: 't1', code: 'K7WQP', name: 'Team 1', status: 'ACTIVE' },
      { id: 't2', code: 'M3RTX', name: 'Team 2', status: 'ACTIVE' },
    ],
    assignments: {},
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

describe('staff routes', () => {
  it('reads and writes the hash', () => {
    expect(parseStaffHash('#/games/abc/teams')).toEqual({
      page: 'game',
      gameId: 'abc',
      tab: 'teams',
    });
    expect(parseStaffHash('#/games/abc/nope')).toMatchObject({ tab: 'settings' });
    expect(parseStaffHash('#/staff')).toEqual({ page: 'staff' });
    expect(parseStaffHash('')).toEqual({ page: 'games' });
    expect(staffHash({ page: 'game', gameId: 'a b', tab: 'branding' })).toBe(
      '#/games/a%20b/branding',
    );
  });
});

describe('staff login', () => {
  it('shows the server message when the login is wrong', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'That email or password is not right.' }), {
            status: 401,
          }),
      ),
    );
    render(<StaffLogin notice={null} onLogin={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email or password is not right.',
    );
  });
});

describe('settings tab', () => {
  it('saves minutes as seconds', async () => {
    const put = vi.fn(async (_path: string, body: unknown) => {
      const settings = (body as { settings: AdminGame['settings'] }).settings;
      return game({ settings });
    });
    const onChange = vi.fn();
    // Holds the game like GamePage does, so the saved settings come back in.
    function Holder() {
      const [g, setG] = useState(game());
      return (
        <SettingsTab
          game={g}
          onChange={(next) => {
            onChange(next);
            setG(next);
          }}
        />
      );
    }
    withStaff(<Holder />, { api: fakeApi({ put: put as StaffApi['put'] }) });
    fireEvent.change(screen.getByLabelText('Round 1'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await screen.findByText('Settings saved.');
    expect(put).toHaveBeenCalledWith('/games/g1/settings', expect.anything());
    const saved = (put.mock.calls[0]![1] as { settings: AdminGame['settings'] }).settings;
    expect(saved.phases.round1Seconds).toBe(120);
    expect(onChange).toHaveBeenCalled();
    expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();
  });

  it('marks a wrong field and does not save', async () => {
    const put = vi.fn();
    withStaff(<SettingsTab game={game()} onChange={vi.fn()} />, { api: fakeApi({ put }) });
    fireEvent.change(screen.getByLabelText('Hint cost'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Enter a number.')).toBeInTheDocument();
    expect(screen.getByLabelText('Hint cost')).toHaveAttribute('aria-invalid', 'true');
    expect(put).not.toHaveBeenCalled();
  });

  it('warns about unsaved changes until they are saved or undone', () => {
    const { unmount } = withStaff(<SettingsTab game={game()} onChange={vi.fn()} />);
    expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Round 1'), { target: { value: '20' } });
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();

    // Leaving asks first; "Cancel" keeps the person on the page.
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    expect(confirmLeave()).toBe(false);
    expect(confirm).toHaveBeenCalledWith(UNSAVED_MESSAGE);

    fireEvent.change(screen.getByLabelText('Round 1'), { target: { value: '35' } });
    expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();
    confirm.mockClear();
    expect(confirmLeave()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    unmount();
  });

  it('is read-only once the game has started', () => {
    withStaff(<SettingsTab game={game({ locked: true, phase: 'ROUND1' })} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Round 1')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
  });
});

describe('teams tab', () => {
  const logins: TeamLoginCard[] = [
    { code: 'K7WQP', name: 'Team 1', password: 'plum-river-sun-4' },
    { code: 'M3RTX', name: 'Team 2', password: 'mint-lake-star-7' },
  ];

  it('shows passwords only while they are fresh', () => {
    const { unmount } = withStaff(<TeamsTab game={game()} onChange={vi.fn()} />);
    expect(screen.queryByText(/plum-river-sun-4/)).not.toBeInTheDocument();
    expect(screen.getByText('K7WQP')).toBeInTheDocument();
    unmount();
    withStaff(<TeamsTab game={game()} onChange={vi.fn()} />, {
      freshLogins: { gameId: 'g1', logins },
    });
    const sheet = screen.getByRole('heading', { name: 'Login sheet' }).closest('section')!;
    expect(within(sheet).getByText(/plum-river-sun-4/)).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /Print login sheet/ })).toBeInTheDocument();
  });

  it('hides the add form after the start', () => {
    withStaff(<TeamsTab game={game({ locked: true })} onChange={vi.fn()} />);
    expect(
      screen.getByText('Teams cannot be added after the game has started.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rename Team 1/ })).not.toBeInTheDocument();
  });

  it('adds teams with the typed names', async () => {
    const post = vi.fn(async () => ({ game: game(), logins: [] }));
    withStaff(<TeamsTab game={game()} onChange={vi.fn()} />, {
      api: fakeApi({ post: post as StaffApi['post'] }),
    });
    fireEvent.change(screen.getByLabelText(/Names/), { target: { value: 'Owls\n\nFalcons\n' } });
    fireEvent.click(screen.getByRole('button', { name: /Add teams/ }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/games/g1/teams', {
        count: 2,
        names: ['Owls', 'Falcons'],
      }),
    );
  });

  it('merges new passwords into the sheet and escapes names when printing', () => {
    const merged = mergeLogins(logins, [
      { code: 'M3RTX', name: 'Team 2', password: 'new-one-here-2' },
      { code: 'ZZZZZ', name: 'Team 3', password: 'x-y-z-3' },
    ]);
    expect(merged.map((l) => l.password)).toEqual([
      'plum-river-sun-4',
      'new-one-here-2',
      'x-y-z-3',
    ]);
    const html = loginSheetHtml('Game', 'Acme', 'https://play.example.com/', [
      { code: 'AAAAA', name: '<script>x</script>', password: 'p' },
    ]);
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&#60;script&#62;');
  });
});
