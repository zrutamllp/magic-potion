import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TeamPage } from './TeamPage';

function stubFetch(login: { status: number; body: object }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/healthz')) {
        return new Response(JSON.stringify({ status: 'ok', db: 'ok', time: '' }));
      }
      return new Response(JSON.stringify(login.body), { status: login.status });
    }),
  );
}

describe('TeamPage login', () => {
  it('shows the server message when the login is wrong', async () => {
    window.sessionStorage.clear();
    stubFetch({
      status: 401,
      body: { code: 'BAD_TEAM_LOGIN', message: 'That team code or password is not right.' },
    });
    render(<TeamPage />);
    fireEvent.change(screen.getByLabelText('Team code'), { target: { value: 'TEAM1' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('That team code or password is not right.')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('mp.team')).toBeNull();
  });
});
