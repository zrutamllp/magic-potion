// Server time is the only clock. The engine never calls Date.now() directly,
// so tests and the simulation can move time forward by hand.

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export class FakeClock implements Clock {
  constructor(private ms: number) {}

  now(): number {
    return this.ms;
  }

  set(ms: number): void {
    this.ms = ms;
  }

  advance(ms: number): void {
    this.ms += ms;
  }
}
