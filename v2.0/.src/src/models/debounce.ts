// Debounce (M.Debounce), pure: a trailing debounce with injected timers. touch() starts the wait, or restarts it while one is pending: a burst of touches fires the callback once,
// `delay` ms after the last of them (the callback reads whatever the burst left, so the last value always lands). cancel() ends the wait without firing; flush() fires at once when a
// wait is pending (true) and does nothing otherwise (false). The wait is over (`pending` false) before the callback runs, so the callback may touch again: a new wait. Timers: any
// object with setTimeout(fn, ms) and clearTimeout(handle) (the tests' clock); none given, the host's. Used by the fog for the atmosphere's tables while a slider moves.
//
// Changelog:
// 2026-11-20: new (Feature S1, story A4).
import { M } from "../engine/core";

export interface DebounceTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const HOST: DebounceTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class Debounce {
  pending: boolean;
  timers: DebounceTimers;
  delay: number;
  private callback: () => void;
  private handle: unknown;

  constructor(delay: number, callback: () => void, timers?: DebounceTimers) {
    this.delay = delay;
    this.callback = callback;
    this.timers = timers || HOST;
    this.pending = false;
    this.handle = null;
  }

  touch(): void {
    if (this.pending) {
      this.timers.clearTimeout(this.handle);
    }
    this.pending = true;
    this.handle = this.timers.setTimeout(() => this.run(), this.delay);
  }

  cancel(): void {
    if (this.pending) {
      this.timers.clearTimeout(this.handle);
    }
    this.pending = false;
    this.handle = null;
  }

  flush(): boolean {
    if (!this.pending) {
      return false;
    }
    this.cancel();
    this.callback();
    return true;
  }

  private run(): void {
    this.pending = false;
    this.handle = null;
    this.callback();
  }
}

M.Debounce = Debounce;
