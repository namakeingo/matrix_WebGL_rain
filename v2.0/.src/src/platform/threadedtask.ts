// ThreadedTask: the superclass of every worker-backed task of the wallpaper. One architecture for all of them:
// 1. inline first: the task works inline from the first moment (its subclass owns the inline implementation; this class takes it as `inline`);
// 2. a worker as soon as possible: start() makes the first attempt at once, in every slot;
// 3. inline again on a worker's failure: a worker lost (its onFail, a failed attempt, kill) leaves the slot without one, and the subclass takes the state and the jobs back
//    (dropped) and runs them inline;
// 4. the worker tried again with an exponential backoff: 20 ms, 40, 80 ... up to BACKOFF_MAX (30 s); the delay is back to 20 ms when the worker lost had run HEALTHY_MS (15 s).
// This class is the supervisor (the state machine, the timers, the backoff, the log); what is specific to a task is given by the subclass (overriding the methods below) or, for a
// plain use and the tests, by `hooks`:
// - spawn(slot, force) (the hooks' `make`): a promise of the slot's worker (a TaskWorker: close(), and onFail, which the worker's wrapper calls on an error, a `failed` message or a ping not answered),
//   or null when none can be made; `force` is the option given ("blob", "url": how to make it)
// - adopt(slot, worker, state): the worker is the slot's from now on; state is snapshot() at that moment, to give the worker (the inline's state)
// - dropped(slot, worker, why): the slot's worker is lost (already closed): take back its pending jobs and its state, and run them inline
// - snapshot(): the state to carry to a worker (default none)
// Slots: a task has `slots` workers (a pool; 1 by default), each with its own attempts and its own backoff; `inline` is true while none is alive.
// Options: observe (told every event), slots, force ("none": refused: no attempt, no timer; the tests' way to refuse a worker), timers (the clock and timeouts, for the tests), backoffStart, backoffFactor,
// backoffMax, healthyMs. State (`state`): "inline" (not started), "starting" (an attempt is made), "worker" (one is alive), "failed" (none alive, a retry waits), "refused", "stopped".
// events: the log of what happened ({ t, name: attempt, adopt, failed, lost, retry (with its delay), stop, refused; slot; why }), also for the readouts and the tests;
// attempts, restarts (workers lost), why (the last loss's), nextRetryMs(slot): the delay of the retry waiting (0: none). kill(slot) loses the slot's worker as a crash does (the
// tests' hook). stop() cancels every timer and closes every worker; a worker made after it is closed at once.
//
// Changelog:
// 2026-11-10: new.
import { M } from "../engine/core";

export interface TaskWorker {
  onFail: ((why: string | undefined) => void) | null;
  close(): void;
}

export interface TaskTimers {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface TaskOptions {
  slots?: number;
  force?: string;
  timers?: TaskTimers;
  backoffStart?: number;
  backoffFactor?: number;
  backoffMax?: number;
  healthyMs?: number;
  // told every event as it is logged (the readouts and the tests' timings follow a task by it)
  observe?: (event: TaskEvent) => void;
}

export interface TaskHooks<I, W extends TaskWorker> {
  make?(slot: number, force: string): Promise<W | null>;
  adopt?(slot: number, worker: W, state: unknown): void;
  dropped?(slot: number, worker: W, why: string): void;
  snapshot?(): unknown;
}

export type TaskState = "inline" | "starting" | "worker" | "failed" | "refused" | "stopped";

export interface TaskEvent {
  t: number;
  name: string;
  slot: number;
  why?: string;
  delay?: number;
}

interface Slot<W> {
  state: "idle" | "starting" | "worker" | "failed";
  worker: W | null;
  // the delay the next retry will wait, the one waiting, and when the worker began
  delay: number;
  scheduled: number;
  since: number;
  timer: unknown;
}

// (a worker's onFail once the worker is let go: a wrapper that reports twice, an error and a failed message, finds a function)
const NOOP = (): void => {};

const REAL: TaskTimers = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class ThreadedTask<I = unknown, W extends TaskWorker = TaskWorker> {
  static BACKOFF_START = 20;
  static BACKOFF_FACTOR = 2;
  static BACKOFF_MAX = 30000;
  static HEALTHY_MS = 15000;

  // the inline implementation, always there
  inline_: I;
  events: TaskEvent[];
  attempts: number;
  restarts: number;
  why: string;
  protected force: string;
  protected timers: TaskTimers;
  protected slotCount: number;
  private slots: Slot<W>[];
  private hooks: TaskHooks<I, W>;
  private stopped: boolean;
  private refusedNow: boolean;
  private backoffStart: number;
  private backoffFactor: number;
  private backoffMax: number;
  private healthyMs: number;
  private observe: ((event: TaskEvent) => void) | null;

  constructor(inline: I, options: TaskOptions = {}, hooks: TaskHooks<I, W> = {}) {
    this.inline_ = inline;
    this.hooks = hooks;
    this.events = [];
    this.attempts = 0;
    this.restarts = 0;
    this.why = "";
    this.force = options.force || "";
    this.timers = options.timers || REAL;
    this.slotCount = Math.max(1, options.slots || 1);
    this.backoffStart = options.backoffStart || ThreadedTask.BACKOFF_START;
    this.backoffFactor = options.backoffFactor || ThreadedTask.BACKOFF_FACTOR;
    this.backoffMax = options.backoffMax || ThreadedTask.BACKOFF_MAX;
    this.healthyMs = options.healthyMs || ThreadedTask.HEALTHY_MS;
    this.observe = options.observe || null;
    this.stopped = false;
    this.refusedNow = false;
    this.slots = [];
    for (let k = 0; k < this.slotCount; k++) {
      this.slots.push({ state: "idle", worker: null, delay: this.backoffStart, scheduled: 0, since: 0, timer: null });
    }
  }

  // ---- what the subclass gives (the hooks by default) ----

  protected spawn(slot: number, force: string): Promise<W | null> {
    return this.hooks.make ? this.hooks.make(slot, force) : Promise.resolve(null);
  }

  protected adopt(slot: number, worker: W, state: unknown): void {
    if (this.hooks.adopt) {
      this.hooks.adopt(slot, worker, state);
    }
  }

  protected dropped(slot: number, worker: W, why: string): void {
    if (this.hooks.dropped) {
      this.hooks.dropped(slot, worker, why);
    }
  }

  protected snapshot(): unknown {
    return this.hooks.snapshot ? this.hooks.snapshot() : null;
  }

  // ---- what it reports ----

  get state(): TaskState {
    if (this.stopped) {
      return "stopped";
    }
    if (this.refusedNow) {
      return "refused";
    }
    if (this.alive > 0) {
      return "worker";
    }
    if (this.slots.some((s) => s.state === "starting")) {
      return "starting";
    }
    if (this.slots.some((s) => s.state === "failed")) {
      return "failed";
    }
    return "inline";
  }

  // the workers alive, and whether the task works inline now (none alive)
  get alive(): number {
    let n = 0;
    for (const s of this.slots) {
      if (s.state === "worker") {
        n++;
      }
    }
    return n;
  }

  get inline(): boolean {
    return this.alive === 0;
  }

  liveSlots(): number[] {
    const out: number[] = [];
    this.slots.forEach((s, k) => {
      if (s.state === "worker") {
        out.push(k);
      }
    });
    return out;
  }

  workerOf(slot: number): W | null {
    const s = this.slots[slot];
    return s && s.state === "worker" ? s.worker : null;
  }

  // the delay of the retry waiting for the slot (0: none waits)
  nextRetryMs(slot: number): number {
    const s = this.slots[slot];
    return s && s.timer !== null ? s.scheduled : 0;
  }

  // ---- the life ----

  // the first attempt at once, in every slot (refused: none, ever)
  start(): void {
    if (this.stopped || this.refusedNow) {
      return;
    }
    if (this.force === "none") {
      this.refusedNow = true;
      this.log("refused", -1);
      return;
    }
    for (let k = 0; k < this.slotCount; k++) {
      if (this.slots[k]!.state === "idle") {
        this.attempt(k);
      }
    }
  }

  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.log("stop", -1);
    for (const s of this.slots) {
      if (s.timer !== null) {
        this.timers.clearTimeout(s.timer);
        s.timer = null;
      }
      if (s.worker) {
        const w = s.worker;
        s.worker = null;
        w.onFail = NOOP;
        w.close();
      }
      s.state = "idle";
    }
  }

  // the tests' hook: the slot's worker lost as a crash loses it
  kill(slot: number): void {
    this.lost(slot, "killed");
  }

  // a worker's failure (the worker's wrapper calls it through onFail)
  lost(slot: number, why: string): void {
    const s = this.slots[slot];
    if (!s || s.state !== "worker" || !s.worker || this.stopped) {
      return;
    }
    const w = s.worker;
    const ranMs = this.timers.now() - s.since;
    s.worker = null;
    s.state = "failed";
    this.restarts++;
    this.why = why;
    w.onFail = NOOP;
    w.close();
    this.log("lost", slot, why);
    this.dropped(slot, w, why);
    if (ranMs >= this.healthyMs) {
      s.delay = this.backoffStart;
    }
    this.schedule(slot);
  }

  private attempt(slot: number): void {
    const s = this.slots[slot]!;
    if (this.stopped) {
      return;
    }
    s.state = "starting";
    s.timer = null;
    s.scheduled = 0;
    this.attempts++;
    this.log("attempt", slot);
    let made: Promise<W | null>;
    try {
      made = this.spawn(slot, this.force);
    } catch (error) {
      made = Promise.reject(error);
    }
    made.then(
      (worker) => {
        if (this.stopped) {
          if (worker) {
            worker.onFail = NOOP;
            worker.close();
          }
          return;
        }
        if (!worker) {
          this.failedAttempt(slot, "no worker could be made");
          return;
        }
        s.worker = worker;
        s.state = "worker";
        s.since = this.timers.now();
        worker.onFail = (why?: string) => this.lost(slot, why || "the worker failed");
        this.log("adopt", slot);
        this.adopt(slot, worker, this.snapshot());
      },
      (error: unknown) => {
        if (!this.stopped) {
          this.failedAttempt(slot, String((error && (error as Error).message) || error));
        }
      },
    );
  }

  private failedAttempt(slot: number, why: string): void {
    const s = this.slots[slot]!;
    s.state = "failed";
    this.why = why;
    this.log("failed", slot, why);
    this.schedule(slot);
  }

  // the retry: after the slot's delay, which then doubles up to the cap
  private schedule(slot: number): void {
    const s = this.slots[slot]!;
    if (this.stopped) {
      return;
    }
    const delay = s.delay;
    s.scheduled = delay;
    s.delay = Math.min(this.backoffMax, delay * this.backoffFactor);
    this.log("retry", slot, undefined, delay);
    s.timer = this.timers.setTimeout(() => {
      s.timer = null;
      this.attempt(slot);
    }, delay);
  }

  private log(name: string, slot: number, why?: string, delay?: number): void {
    const e: TaskEvent = { t: this.timers.now(), name, slot };
    if (why !== undefined) {
      e.why = why;
    }
    if (delay !== undefined) {
      e.delay = delay;
    }
    this.events.push(e);
    if (this.observe) {
      this.observe(e);
    }
  }
}

// ClientTask: a ThreadedTask over a client class that already exists (the scene's, the bolt's, the quality's: a handle to a worker with onFail and close), for the tasks whose
// callers already take the client or leave it (null: they work inline). makeWorker(slot, force) gives a slot's client; onChange(client, slot) is told with it when it takes
// over and with null when it is lost (or the task stopped), so the wallpaper gives its effects the client, or takes it away.
export interface ClientTaskOptions<C extends TaskWorker> extends TaskOptions {
  makeWorker?: (slot: number, force: string) => Promise<C | null>;
  onChange?: (client: C | null, slot: number) => void;
}

export class ClientTask<C extends TaskWorker> extends ThreadedTask<null, C> {
  private makeClient: ClientTaskOptions<C>["makeWorker"];
  private changed: ClientTaskOptions<C>["onChange"];

  constructor(options: ClientTaskOptions<C> = {}) {
    super(null, options);
    this.makeClient = options.makeWorker;
    this.changed = options.onChange;
  }

  protected spawn(slot: number, force: string): Promise<C | null> {
    return this.makeClient ? this.makeClient(slot, force) : Promise.resolve(null);
  }

  protected adopt(slot: number, worker: C): void {
    if (this.changed) {
      this.changed(worker, slot);
    }
  }

  protected dropped(slot: number): void {
    if (this.changed) {
      this.changed(null, slot);
    }
  }

  // the client of a slot (null: none alive there)
  client(slot = 0): C | null {
    return this.workerOf(slot);
  }

  stop(): void {
    const live = this.liveSlots();
    super.stop();
    if (this.changed) {
      for (const slot of live) {
        this.changed(null, slot);
      }
    }
  }
}

M.ThreadedTask = ThreadedTask;
M.ClientTask = ClientTask;
