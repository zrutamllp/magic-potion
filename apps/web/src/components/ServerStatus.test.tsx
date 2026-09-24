import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ServerStatus } from './ServerStatus';

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

describe('ServerStatus', () => {
  it('shows "Server OK" when the API answers', async () => {
    stubFetch(async () =>
      Response.json({ status: 'ok', db: 'ok', time: new Date().toISOString() }),
    );
    render(<ServerStatus />);
    expect(await screen.findByText('Server OK')).toBeInTheDocument();
    expect(screen.getByText('Database OK')).toBeInTheDocument();
  });

  it('shows the database state when it is not set up', async () => {
    stubFetch(async () =>
      Response.json({ status: 'ok', db: 'not_configured', time: new Date().toISOString() }),
    );
    render(<ServerStatus />);
    expect(await screen.findByText('Database not set up yet')).toBeInTheDocument();
  });

  it('shows "Server unreachable" when the request fails', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    render(<ServerStatus />);
    expect(await screen.findByText('Server unreachable')).toBeInTheDocument();
  });

  it('checks again when "Try again" is pressed', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        Response.json({ status: 'ok', db: 'ok', time: new Date().toISOString() }),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(<ServerStatus />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Server OK')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows "Server unreachable" when the response is malformed', async () => {
    stubFetch(async () => Response.json({ hello: 'world' }));
    render(<ServerStatus />);
    expect(await screen.findByText('Server unreachable')).toBeInTheDocument();
  });
});
