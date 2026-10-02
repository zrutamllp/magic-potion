import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckUpdate } from './runChecks';

let finish: (() => void) | null = null;
let report: ((patch: CheckUpdate) => void) | null = null;
const runChecks = vi.fn((update: (patch: CheckUpdate) => void) => {
  report = update;
  return new Promise<void>((resolve) => {
    finish = resolve;
  });
});
vi.mock('./runChecks', () => ({ runChecks: (u: (p: CheckUpdate) => void) => runChecks(u) }));

const { CheckPage } = await import('./CheckPage');

const ALL_GOOD: CheckUpdate = {
  server: { ok: true, ms: 80 },
  polling: { ok: true, ms: 100 },
  websocket: { ok: true, ms: 90 },
  speed: 60,
  pictures: 'ok',
  picturesHost: 'abc.public.blob.vercel-storage.com',
  fonts: true,
  youtube: true,
  vimeo: true,
};

async function complete(patch: CheckUpdate) {
  await act(async () => {
    report?.(patch);
    finish?.();
    await Promise.resolve();
  });
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  runChecks.mockClear();
});

describe('CheckPage', () => {
  it('shows the generic title, checks while running, then Ready to play', async () => {
    render(<CheckPage />);
    expect(
      screen.getByRole('heading', { name: 'Magic Potion Challenge – Connection check' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Share these results with your event organiser.')).toBeInTheDocument();
    expect(screen.getByTestId('check-website')).toHaveAttribute('data-status', 'pass');
    expect(screen.getByTestId('check-server')).toHaveAttribute('data-status', 'running');
    expect(screen.getByRole('button', { name: 'Copy results' })).toBeDisabled();

    await complete(ALL_GOOD);
    expect(screen.getByText('Ready to play')).toBeInTheDocument();
    expect(screen.queryByText('Addresses to allow:')).not.toBeInTheDocument();
    expect(runChecks).toHaveBeenCalled();
  });

  it('polling only: With limits, and the WebSocket address to allow', async () => {
    render(<CheckPage />);
    await complete({ ...ALL_GOOD, websocket: { ok: false } });
    expect(screen.getByText('Will work, with limits')).toBeInTheDocument();
    expect(screen.getByText('Addresses to allow:')).toBeInTheDocument();
    expect(screen.getByText(/^wss:\/\/.* \(WebSocket, port 443\)$/)).toBeInTheDocument();
  });

  it('nothing connects: Blocked, send to IT', async () => {
    render(<CheckPage />);
    await complete({
      ...ALL_GOOD,
      polling: { ok: false },
      websocket: { ok: false },
      speed: 'failed',
    });
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getByText(/Send this page to your IT team/)).toBeInTheDocument();
  });

  it('copies a text summary', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<CheckPage />);
    await complete(ALL_GOOD);
    await click('Copy results');
    const text = writeText.mock.calls[0]?.[0] ?? '';
    expect(text).toContain('Result: Ready to play');
    expect(text).toContain('Date: ');
    expect(screen.getByText(/^Copied/)).toBeInTheDocument();
  });

  it('shows the text to copy by hand when the clipboard is blocked', async () => {
    const writeText = vi.fn((_text: string) => Promise.reject(new Error('blocked')));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<CheckPage />);
    await complete(ALL_GOOD);
    await click('Copy results');
    const box = screen.getByLabelText('Results') as HTMLTextAreaElement;
    expect(box.value).toContain('Result: Ready to play');
  });

  it('runs again on request', async () => {
    render(<CheckPage />);
    await complete(ALL_GOOD);
    const before = runChecks.mock.calls.length;
    await click('Run again');
    expect(runChecks.mock.calls.length).toBe(before + 1);
    expect(screen.getByTestId('check-server')).toHaveAttribute('data-status', 'running');
  });
});
