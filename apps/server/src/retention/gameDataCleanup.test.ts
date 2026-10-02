import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameDataCleanup } from './gameDataCleanup';

// The scheduled job only decides when to run; what is due is worked out from database times
// each run (see http/retention.test.ts and retention.integration.test.ts).

afterEach(() => {
  vi.useRealTimers();
});

describe('GameDataCleanup', () => {
  it('runs once at start, then every few hours', async () => {
    vi.useFakeTimers();
    const runs: number[] = [];
    const job = new GameDataCleanup({
      deleteDue: async () => {
        runs.push(Date.now());
        return [];
      },
      everyMs: 3 * 60 * 60 * 1000,
    });
    job.start();
    expect(runs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);
    expect(runs).toHaveLength(2);
    job.stop();
    await vi.advanceTimersByTimeAsync(10 * 60 * 60 * 1000);
    expect(runs).toHaveLength(2);
  });

  it('never runs twice at once, and survives a failed run', async () => {
    let release: (ids: string[]) => void = () => {};
    let calls = 0;
    const job = new GameDataCleanup({
      deleteDue: () => {
        calls++;
        if (calls === 2) return Promise.reject(new Error('database down'));
        return new Promise<string[]>((resolve) => (release = resolve));
      },
    });
    const a = job.runOnce();
    const b = job.runOnce();
    expect(calls).toBe(1);
    release(['game-1']);
    expect(await a).toEqual(['game-1']);
    expect(await b).toEqual(['game-1']);
    await expect(job.runOnce()).rejects.toThrow('database down');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    job.start();
    job.stop();
    errors.mockRestore();
  });
});
