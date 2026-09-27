// Slows down password guessing: after too many failed logins for one address and one
// team code or email, further tries are refused until the window passes.
// In memory, which is enough for the single server instance.

export interface RateLimitOptions {
  maxFailures: number;
  windowMs: number;
  now?: () => number;
}

export class LoginRateLimiter {
  private readonly failures = new Map<string, { count: number; resetAt: number }>();
  private readonly now: () => number;

  constructor(private readonly opts: RateLimitOptions) {
    this.now = opts.now ?? Date.now;
  }

  blocked(key: string): boolean {
    const entry = this.failures.get(key);
    if (!entry) return false;
    if (entry.resetAt <= this.now()) {
      this.failures.delete(key);
      return false;
    }
    return entry.count >= this.opts.maxFailures;
  }

  fail(key: string): void {
    this.prune();
    const now = this.now();
    const entry = this.failures.get(key);
    if (!entry || entry.resetAt <= now) {
      this.failures.set(key, { count: 1, resetAt: now + this.opts.windowMs });
    } else {
      entry.count++;
    }
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  private prune(): void {
    if (this.failures.size < 10_000) return;
    const now = this.now();
    for (const [key, entry] of this.failures) if (entry.resetAt <= now) this.failures.delete(key);
  }
}
