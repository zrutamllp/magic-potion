import { useEffect, useState } from 'react';

// The server sends "ms left" with every state. The browser counts down from the moment the
// state arrived (a monotonic clock), so a wrong computer clock never matters, and a refresh
// simply gets fresh numbers from the server.

export const monotonicNow = () => performance.now();

export function msLeft(
  sentMsLeft: number | null,
  receivedAt: number,
  running: boolean,
  now: number,
): number | null {
  if (sentMsLeft === null) return null;
  if (!running) return sentMsLeft;
  return Math.max(0, sentMsLeft - (now - receivedAt));
}

// 125000 -> "2:05", 3725000 -> "1:02:05". Rounds up, so "0:00" means time is really up.
export function formatMs(ms: number | null): string {
  if (ms === null) return '--:--';
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// Re-renders a few times a second so countdowns move.
export function useTicker(intervalMs = 250): number {
  const [now, setNow] = useState(monotonicNow);
  useEffect(() => {
    const id = setInterval(() => setNow(monotonicNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export const money = (n: number) => n.toLocaleString('en-US');
