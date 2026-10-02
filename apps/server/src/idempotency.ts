// Makes every action safe to repeat (Phase 7C). When a connection drops just as the server
// answers, the browser sends the same action again with the same action ID. The first time the
// action runs; a repeat gets the same answer and changes nothing, also when it arrives while
// the first is still running. Kept in memory: a restart forgets the IDs, and the server is
// never restarted during an event.

const ACTION_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function validActionId(value: unknown): value is string {
  return typeof value === 'string' && ACTION_ID.test(value);
}

export interface RecentActionsOptions {
  // IDs remembered per owner (a team or a staff member); the oldest is dropped first.
  maxPerOwner?: number;
  // How long an ID is remembered.
  keepMs?: number;
  now?: () => number;
  // An answer that must not be stored, so a repeat may run again (for example "busy").
  keep?: (value: unknown) => boolean;
}

interface Entry {
  at: number;
  result: Promise<unknown>;
}

export class RecentActions {
  private readonly owners = new Map<string, Map<string, Entry>>();
  private readonly maxPerOwner: number;
  private readonly keepMs: number;
  private readonly now: () => number;
  private readonly keep: (value: unknown) => boolean;

  constructor(opts: RecentActionsOptions = {}) {
    this.maxPerOwner = opts.maxPerOwner ?? 200;
    this.keepMs = opts.keepMs ?? 10 * 60_000;
    this.now = opts.now ?? Date.now;
    this.keep = opts.keep ?? (() => true);
  }

  // Runs `work` once per (owner, action ID). Without a valid ID it simply runs.
  run<T>(owner: string, actionId: unknown, work: () => Promise<T>): Promise<T> {
    if (!validActionId(actionId)) return work();
    const now = this.now();
    let ids = this.owners.get(owner);
    if (!ids) this.owners.set(owner, (ids = new Map()));
    const known = ids.get(actionId);
    if (known && now - known.at < this.keepMs) return known.result as Promise<T>;
    if (known) ids.delete(actionId);

    const result = work();
    ids.set(actionId, { at: now, result });
    // A failure or an answer that must not be kept is forgotten, so the repeat runs again.
    result.then(
      (value) => {
        if (!this.keep(value)) this.forget(owner, actionId, result);
      },
      () => this.forget(owner, actionId, result),
    );
    this.trim(ids, now);
    return result;
  }

  private forget(owner: string, actionId: string, result: Promise<unknown>): void {
    const ids = this.owners.get(owner);
    if (ids?.get(actionId)?.result === result) ids.delete(actionId);
  }

  private trim(ids: Map<string, Entry>, now: number): void {
    for (const [id, entry] of ids) {
      if (now - entry.at >= this.keepMs || ids.size > this.maxPerOwner) ids.delete(id);
      else break;
    }
  }
}
