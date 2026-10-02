import { describe, expect, it } from 'vitest';
import { RecentActions, validActionId } from './idempotency';

const ID = 'action-0001';

function counter() {
  let runs = 0;
  return {
    get runs() {
      return runs;
    },
    work: async () => ({ ok: true, run: ++runs }),
  };
}

describe('recent actions (safe to repeat)', () => {
  it('runs an action once and answers a repeat with the same answer', async () => {
    const recent = new RecentActions();
    const c = counter();
    const first = await recent.run('team:1', ID, c.work);
    const again = await recent.run('team:1', ID, c.work);
    expect(c.runs).toBe(1);
    expect(again).toEqual(first);
  });

  it('also when the repeat arrives while the first is still running', async () => {
    const recent = new RecentActions();
    let release!: () => void;
    let runs = 0;
    const slow = () =>
      new Promise<number>((resolve) => {
        runs++;
        release = () => resolve(runs);
      });
    const a = recent.run('team:1', ID, slow);
    const b = recent.run('team:1', ID, slow);
    release();
    expect(await Promise.all([a, b])).toEqual([1, 1]);
    expect(runs).toBe(1);
  });

  it('runs different IDs, and the same ID for another team, separately', async () => {
    const recent = new RecentActions();
    const c = counter();
    await recent.run('team:1', ID, c.work);
    await recent.run('team:1', 'action-0002', c.work);
    await recent.run('team:2', ID, c.work);
    expect(c.runs).toBe(3);
  });

  it('runs every time without a valid ID, as before', async () => {
    const recent = new RecentActions();
    const c = counter();
    for (const id of [undefined, '', 'short', 'x'.repeat(65), 'bad id!', 42]) {
      await recent.run('team:1', id, c.work);
    }
    expect(c.runs).toBe(6);
    expect(validActionId(ID)).toBe(true);
  });

  it('forgets an ID after 10 minutes', async () => {
    let now = 0;
    const recent = new RecentActions({ now: () => now });
    const c = counter();
    await recent.run('team:1', ID, c.work);
    now = 10 * 60_000 - 1;
    await recent.run('team:1', ID, c.work);
    expect(c.runs).toBe(1);
    now = 10 * 60_000;
    await recent.run('team:1', ID, c.work);
    expect(c.runs).toBe(2);
  });

  it('keeps at most 200 IDs per owner, dropping the oldest', async () => {
    const recent = new RecentActions();
    const c = counter();
    for (let i = 0; i <= 200; i++) await recent.run('team:1', `action-${i}-xyz`, c.work);
    expect(c.runs).toBe(201);
    await recent.run('team:1', 'action-200-xyz', c.work);
    expect(c.runs).toBe(201);
    await recent.run('team:1', 'action-0-xyz', c.work);
    expect(c.runs).toBe(202);
  });

  it('does not keep failures or answers it is told not to keep', async () => {
    const recent = new RecentActions({ keep: (v) => v !== 'busy' });
    let runs = 0;
    await expect(
      recent.run('team:1', ID, async () => {
        runs++;
        throw new Error('database down');
      }),
    ).rejects.toThrow('database down');
    await recent.run('team:1', ID, async () => ++runs);
    expect(runs).toBe(2);

    await recent.run('team:1', 'action-busy', async () => 'busy');
    let again = 0;
    await recent.run('team:1', 'action-busy', async () => ++again);
    expect(again).toBe(1);
  });
});
