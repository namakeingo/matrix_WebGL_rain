// QualityPool: the quality workers' pool, on the message path (no shared memory is needed). run(frame, jobs, params)
// builds one flat list of tasks over the effects' jobs (QualityTasks.build), gives them to the workers by
// QualityTasks.assign, sends ONE message a worker, counts the replies in and merges the parts into one levels array a
// job (the effect's units long). The static data of an effect (setStatic: its arrays and job kind) goes to every worker
// once, when it changes, with a version the run names, so a worker never uses arrays of another version. The pool is
// not wired into the frame yet: the effects' adapters come after it.
// - Inline: a frame whose jobs add up to under inlineBelow units (INLINE_BELOW) is processed on the calling thread
//   with the same QualityJobs functions the worker calls (a message costs more than the work); with no live worker
//   everything is inline (report().mode "none").
// - Late: the frame's replies are awaited at most lateMs (QualityTasks.LATE_MS); past it run() resolves null and counts
//   late. Frames never overlap: while a late frame's replies are still owed, run() resolves null at once (counted
//   late, nothing sent), and the late replies, when they come, are dropped. A worker owing a reply in 5 consecutive
//   frames (WATCHDOG_FRAMES) is dead: it is terminated and the pool says so (onLost); the QualityPoolTask makes it again after its backoff (20 ms, 40 ...: a fresh worker given to
//   adopt, given the statics again, restarts), as often as it happens.
// - Dead: onerror and onmessageerror (and fail(index), the same for the tests) mark a worker dead and terminate it; its
//   tasks of the frame in flight are done inline, so the frame's levels stay exact, and the next frames are assigned
//   to the others. A reply that says a static is missing or of another version has its tasks done inline too.
// - Start: QualityPool.start resolves only after every worker answered its ping (a worker answers once its script is
//   loaded; at most READY_MS, a worker that does not is dead and not waited for again); a worker made again by the
//   watchdog answers its ping before it is used. A worker is used from its pong, and its first WARMUP_FRAMES frames have
//   the late bound WARM_LATE_MS (its first runs include its JIT) and are not counted by the watchdog.
// Workers are made by options.make(index) (null: none) and, later, given to adopt(index, worker) (the QualityPoolTask's: it makes them from the bundle, name "quality", as soon as
// it can, and again after a loss); QualityPool.start makes them all at once from the bundle.
// QualityPoolTask: the pool as a ThreadedTask (platform/threadedtask.ts), a slot for each worker; see the class.
//
// Changelog:
// 2026-11-06: new.
// 2026-11-06: start waits for every worker's pong; warm-up (30 frames, late bound 25 ms) outside the watchdog.
// 2026-11-10: a worker lost is told (onLost) and a worker given later (adopt) replaces the pool's own remake once; QualityPoolTask.
import { M } from "./core";
import { Workers } from "../platform/workers";
import { ThreadedTask } from "../platform/threadedtask";
import type { TaskOptions, TaskWorker } from "../platform/threadedtask";
import "../models/quality/tasks";
import "../models/quality/jobs";
import "../workers/qualityworker";
import type { QualityJob, QualityTask, QualityPoolReport } from "../models/quality/types";
import type { QualityStatics, QualityParams } from "../models/quality/jobs";

type Message = Record<string, unknown>;

// the part of a Worker the pool uses (a stand-in in the tests)
export interface PoolWorker {
  postMessage(message: Message, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: { data: Message }) => void) | null;
  onerror: ((event: { message?: string; preventDefault?(): void }) => void) | null;
  onmessageerror: ((event: object) => void) | null;
}

export interface PoolOptions {
  make?: (index: number) => PoolWorker | null;
  // a worker lost (dead: ended, its tasks of the frame in flight done here): told with its slot's index and why; the supervising task makes it again (adopt)
  onLost?: (index: number, why: string) => void;
  inlineBelow?: number;
  lateMs?: number;
  // the late bound and the number of frames it holds for after a worker is ready (its first runs include its JIT)
  warmLateMs?: number;
  warmupFrames?: number;
  // a worker is used only after its pong (it answers once its script is loaded), at most readyMs
  ping?: boolean;
  readyMs?: number;
  now?: () => number;
  cleanup?: () => void;
  // the last worker (with at least 2) is kept for the fog's shade bakes: the frames' tasks go to the others only (see reserveFor)
  reserveForBakes?: boolean;
}

export interface QualityResults {
  frame: number;
  levels: Record<number, Uint8Array>;
}

interface Slot {
  index: number;
  worker: PoolWorker | null;
  alive: boolean;
  lateFrames: number;
  restarted: boolean;
  tasks: QualityTask[];
  // the frames left of the warm-up, whether this frame's call is in it, and the wait for the pong
  warm: number;
  warmCall: boolean;
  readyTimer: ReturnType<typeof setTimeout> | null;
  readyDone: (() => void) | null;
  readyPromise: Promise<void> | null;
}

interface Frame {
  frame: number;
  results: QualityResults;
  waiting: Set<number>;
  timedOut: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  resolve: (results: QualityResults | null) => void;
  params: Record<number, QualityParams>;
  start: number;
  posted: number;
}

interface StaticData {
  version: number;
  kind: string;
  arrays: QualityStatics;
}

export class QualityPool {
  static INLINE_BELOW = 512;
  static WATCHDOG_FRAMES = 5;
  static WARMUP_FRAMES = 30;
  static WARM_LATE_MS = 25;
  static READY_MS = 5000;
  // the low-priority bakes in the worker at once, and waiting (the oldest dropped past it: its reply never comes, as a worker's that died)
  static LOW_OUT = 4;
  static LOW_QUEUE_MOST = 32;
  // an urgent bake not answered by then no longer holds the low-priority ones back (ms)
  static URGENT_MAX_MS = 3000;
  // the slot reserved for the bakes among `count` workers: the last from 2 on (a bake is a few ms of a worker; the frames' tasks have a late bound of 3 ms), none for 1
  static reserveFor(count: number): number {
    return count >= 2 ? count - 1 : -1;
  }
  slots: Slot[];
  statics: Map<number, StaticData>;
  inlineBelow: number;
  lateMs: number;
  warmLateMs: number;
  warmupFrames: number;
  readyMs: number;
  now: () => number;
  options: PoolOptions;
  frame: Frame | null;
  late: number;
  dead: number;
  alive: number;
  restarts: number;
  sent: number;
  lastMs: number;
  lastWaitedMs: number;
  destroyed: boolean;
  // the bake jobs out (id: the slot it went to and its callback) and the count made
  bakes: Map<number, { slot: number; onReply: (reply: Message) => void; low: boolean; at: number }>;
  nextBake: number;
  // the low-priority bakes (the sky's shade layers) waiting: they go to the worker only while no urgent bake (a strike's) is out and fewer than LOW_OUT of
  // them are, so an urgent bake waits behind at most LOW_OUT of them (a few ms each) and not behind a whole draw's layers
  lowQueue: { effect: number; message: Message; onReply: (reply: Message) => void }[];
  urgentOut: number;
  lowOut: number;
  // the slot reserved for the bakes (-1: none)
  reserved: number;
  // whether the reservation is asked for (with one worker there is none to give: no bake at all)
  reserving: boolean;

  constructor(count: number, options: PoolOptions = {}) {
    this.options = options;
    this.inlineBelow = options.inlineBelow === undefined ? QualityPool.INLINE_BELOW : options.inlineBelow;
    this.lateMs = options.lateMs === undefined ? M.QualityTasks.LATE_MS : options.lateMs;
    this.warmLateMs = options.warmLateMs === undefined ? QualityPool.WARM_LATE_MS : options.warmLateMs;
    this.warmupFrames = options.warmupFrames === undefined ? QualityPool.WARMUP_FRAMES : options.warmupFrames;
    this.readyMs = options.readyMs === undefined ? QualityPool.READY_MS : options.readyMs;
    this.now = options.now || (() => performance.now());
    this.statics = new Map();
    this.frame = null;
    this.late = 0;
    this.dead = 0;
    this.alive = 0;
    this.restarts = 0;
    this.sent = 0;
    this.lastMs = 0;
    this.lastWaitedMs = 0;
    this.destroyed = false;
    this.bakes = new Map();
    this.nextBake = 0;
    this.lowQueue = [];
    this.urgentOut = 0;
    this.lowOut = 0;
    this.reserving = !!options.reserveForBakes;
    this.reserved = options.reserveForBakes ? QualityPool.reserveFor(count) : -1;
    this.slots = [];
    for (let i = 0; i < count; i++) {
      const slot: Slot = { index: i, worker: null, alive: false, lateFrames: 0, restarted: false, tasks: [], warm: 0, warmCall: false, readyTimer: null, readyDone: null, readyPromise: null };
      this.slots.push(slot);
      const worker = options.make ? options.make(i) : null;
      if (worker) {
        this.attach(slot, worker, !!options.ping);
      }
    }
  }

  // resolves once every worker has answered its ping or been given up on (readyMs): the pool is then as many workers as are alive
  ready(): Promise<void> {
    return Promise.all(this.slots.map((slot) => slot.readyPromise)).then(() => undefined);
  }

  // the workers made from the bundle (each named "quality"), as many as could be made
  static start(base: string, count: number, options: PoolOptions = {}): Promise<QualityPool> {
    const urls: string[] = [];
    const startOne = () =>
      M.Workers.start(base, { name: "quality" }).then((made) => {
        if (made && made.url) {
          urls.push(made.url);
        }
        return made ? (made.worker as unknown as PoolWorker) : null;
      });
    return Promise.all(Array.from({ length: count }, startOne)).then((workers) => {
      const pool = new QualityPool(
        count,
        Object.assign({ ping: true, reserveForBakes: count >= 2 }, options, {
          make: (index: number) => workers[index],
          cleanup: () => urls.forEach((url) => URL.revokeObjectURL(url)),
        }),
      );
      // (no frame before every worker has answered its ping: a worker answers it once its script is loaded)
      return pool.ready().then(() => pool);
    });
  }

  // a worker taken: at once usable, or (ping) after its pong, at most readyMs
  attach(slot: Slot, worker: PoolWorker, ping: boolean): void {
    slot.worker = worker;
    slot.alive = false;
    slot.lateFrames = 0;
    slot.readyPromise = null;
    if (ping) {
      slot.readyPromise = new Promise<void>((resolve) => {
        slot.readyDone = resolve;
      });
      slot.readyTimer = setTimeout(() => {
        slot.readyTimer = null;
        if (slot.worker === worker && !slot.alive) {
          this.kill(slot, "the quality worker did not answer its ping");
        }
      }, this.readyMs);
    } else {
      this.markReady(slot);
    }
    worker.onmessage = (event) => {
      if (slot.worker === worker) {
        this.receive(slot, event.data);
      }
    };
    worker.onerror = (event) => {
      if (event && event.preventDefault) {
        event.preventDefault();
      }
      if (slot.worker === worker) {
        this.kill(slot, "the quality worker failed");
      }
    };
    worker.onmessageerror = () => {
      if (slot.worker === worker) {
        this.kill(slot, "the quality worker's message could not be read");
      }
    };
    // (everything the worker needs to answer: the statics so far, then the ping)
    this.statics.forEach((data, effect) => this.post(slot, { type: "static", effect, version: data.version, kind: data.kind, arrays: data.arrays }));
    if (ping) {
      this.post(slot, { type: "ping" });
    }
  }

  // a worker answered: alive, in its warm-up
  markReady(slot: Slot): void {
    if (slot.alive || !slot.worker) {
      return;
    }
    slot.alive = true;
    slot.warm = this.warmupFrames;
    if (slot.index !== this.reserved) {
      this.alive++;
    }
    this.readyIs(slot);
  }

  // the wait for a worker over (answered, or given up on)
  readyIs(slot: Slot): void {
    if (slot.readyTimer !== null) {
      clearTimeout(slot.readyTimer);
      slot.readyTimer = null;
    }
    if (slot.readyDone) {
      slot.readyDone();
      slot.readyDone = null;
    }
  }

  post(slot: Slot, message: Message): void {
    if (slot.worker) {
      this.sent++;
      slot.worker.postMessage(message);
    }
  }

  // an effect's static arrays and job kind, sent to every worker once (and kept for the inline path and the workers made later)
  setStatic(effect: number, arrays: QualityStatics, kind = "units"): void {
    const old = this.statics.get(effect);
    const data: StaticData = { version: (old ? old.version : 0) + 1, kind, arrays };
    this.statics.set(effect, data);
    for (const slot of this.slots) {
      this.post(slot, { type: "static", effect, version: data.version, kind, arrays });
    }
  }

  // the levels of the jobs' units for a frame: an object of levels by effect, or null when a worker is late
  run(frame: number, jobs: QualityJob[], params: Record<number, QualityParams>): Promise<QualityResults | null> {
    const start = this.now();
    // (each call is a frame of the warm-up of the workers that are ready: its late bound is wider and it is not counted by the watchdog)
    let warm = false;
    for (const slot of this.slots) {
      slot.warmCall = slot.alive && slot.warm > 0 && slot.index !== this.reserved;
      if (slot.warmCall) {
        slot.warm--;
        warm = true;
      }
    }
    if (this.frame) {
      // (a late frame's replies are still owed: nothing starts, the workers owing them are one frame later)
      this.late++;
      Array.from(this.frame.waiting).forEach((index) => this.lateFrame(this.slots[index]));
      return Promise.resolve(null);
    }
    const results: QualityResults = { frame, levels: {} };
    let total = 0;
    for (const job of jobs) {
      results.levels[job.effect] = new Uint8Array(job.units);
      total += job.units;
    }
    const live = this.slots.filter((slot) => slot.alive && slot.index !== this.reserved);
    if (total < this.inlineBelow || live.length === 0) {
      for (const job of jobs) {
        this.inline(job.effect, 0, job.units, params, results);
      }
      this.lastMs = this.now() - start;
      this.lastWaitedMs = 0;
      return Promise.resolve(results);
    }
    const tasks = M.QualityTasks.build(jobs, live.length);
    const lists = M.QualityTasks.assign(tasks, live.length);
    return new Promise((resolve) => {
      const state: Frame = { frame, results, waiting: new Set(), timedOut: false, timer: null, resolve, params, start, posted: 0 };
      this.frame = state;
      live.forEach((slot, i) => {
        slot.tasks = lists[i];
        if (!lists[i].length) {
          return;
        }
        const versions: Record<number, number> = {};
        const sendParams: Record<number, QualityParams> = {};
        for (const task of lists[i]) {
          const data = this.statics.get(task.effect);
          versions[task.effect] = data ? data.version : 0;
          sendParams[task.effect] = params[task.effect];
        }
        state.waiting.add(slot.index);
        this.post(slot, { type: "run", frame, versions, params: sendParams, tasks: lists[i] });
      });
      state.posted = this.now();
      state.timer = setTimeout(() => {
        state.timer = null;
        if (this.frame === state && state.waiting.size) {
          state.timedOut = true;
          this.late++;
          state.resolve(null);
          Array.from(state.waiting).forEach((index) => this.lateFrame(this.slots[index]));
        }
      }, warm ? Math.max(this.warmLateMs, this.lateMs) : this.lateMs);
      this.settle(state);
    });
  }

  // a range of one effect's units on this thread
  inline(effect: number, from: number, to: number, params: Record<number, QualityParams>, results: QualityResults): void {
    const data = this.statics.get(effect);
    if (!data) {
      throw new Error("no static data for quality effect " + effect);
    }
    M.QualityJobs.run(data.kind, data.arrays, params[effect], from, to, results.levels[effect]);
  }

  // a bake job (the fog's shade grid: a run of layers over a box) to one live worker, round robin; onReply gets the worker's answer (a reply of
  // type "baked" with data, or an error). Outside the frames' tasks: a reply that never comes (the worker dies) is just never called. False when
  // no worker is alive or the effect has no static
  bake(effect: number, message: Message, onReply: (reply: Message) => void, low = false): boolean {
    const data = this.statics.get(effect);
    // (the reserved worker alone when there is one; else every live worker in turn)
    const live = this.slots.filter((slot) => slot.alive && (!this.reserving || slot.index === this.reserved));
    if (!data || live.length === 0) {
      return false;
    }
    if (this.urgentOut > 0) {
      this.expireUrgent();
      if (this.urgentOut === 0) {
        this.pump();
      }
    }
    if (low && (this.urgentOut > 0 || this.lowOut >= QualityPool.LOW_OUT || this.lowQueue.length > 0)) {
      this.lowQueue.push({ effect, message, onReply });
      if (this.lowQueue.length > QualityPool.LOW_QUEUE_MOST) {
        this.lowQueue.shift();
      }
      return true;
    }
    this.send(live, effect, message, onReply, low);
    return true;
  }

  // the urgent bakes out for over URGENT_MAX_MS forgotten (a reply that comes later is dropped: no job is waiting for it)
  expireUrgent(): void {
    const now = this.now();
    this.bakes.forEach((job, id) => {
      if (!job.low && now - job.at > QualityPool.URGENT_MAX_MS) {
        this.bakes.delete(id);
        this.urgentOut--;
      }
    });
  }

  // a bake posted to the next live worker
  send(live: Slot[], effect: number, message: Message, onReply: (reply: Message) => void, low: boolean): void {
    const data = this.statics.get(effect)!;
    const slot = live[this.nextBake++ % live.length];
    const id = this.nextBake;
    this.bakes.set(id, { slot: slot.index, onReply, low, at: this.now() });
    if (low) {
      this.lowOut++;
    } else {
      this.urgentOut++;
    }
    this.post(slot, Object.assign({}, message, { type: "bake", id, effect, version: data.version }));
  }

  // the waiting low-priority bakes sent while the worker has room for them
  pump(): void {
    const live = this.slots.filter((slot) => slot.alive && (!this.reserving || slot.index === this.reserved));
    while (live.length > 0 && this.lowQueue.length > 0 && this.urgentOut === 0 && this.lowOut < QualityPool.LOW_OUT) {
      const job = this.lowQueue.shift()!;
      if (this.statics.has(job.effect)) {
        this.send(live, job.effect, job.message, job.onReply, true);
      }
    }
  }

  receive(slot: Slot, m: Message): void {
    if (m && m.type === "pong") {
      this.markReady(slot);
      return;
    }
    if (m && m.type === "baked") {
      const job = this.bakes.get(m.id as number);
      if (job) {
        this.bakes.delete(m.id as number);
        if (job.low) {
          this.lowOut--;
        } else {
          this.urgentOut--;
        }
        job.onReply(m);
        this.pump();
      }
      return;
    }
    const state = this.frame;
    if (!m || m.type !== "result" || !state || m.frame !== state.frame || !state.waiting.has(slot.index)) {
      return;
    }
    state.waiting.delete(slot.index);
    slot.lateFrames = 0;
    if (!state.timedOut) {
      if (m.error) {
        this.redo(slot, state);
      } else {
        for (const part of m.parts as { effect: number; from: number; levels: Uint8Array }[]) {
          state.results.levels[part.effect].set(part.levels, part.from);
        }
      }
    }
    this.settle(state);
  }

  // the tasks a worker owed, done here
  redo(slot: Slot, state: Frame): void {
    for (const task of slot.tasks) {
      this.inline(task.effect, task.from, task.to, state.params, state.results);
    }
  }

  // the frame is done when nothing is owed
  settle(state: Frame): void {
    if (this.frame !== state || state.waiting.size) {
      return;
    }
    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    this.frame = null;
    if (!state.timedOut) {
      const end = this.now();
      this.lastMs = end - state.start;
      this.lastWaitedMs = state.posted ? end - state.posted : 0;
      state.resolve(state.results);
    }
  }

  // a worker owing its reply for one more frame; WATCHDOG_FRAMES in a row: dead, made again once
  lateFrame(slot: Slot): void {
    if (slot.warmCall) {
      return;
    }
    slot.lateFrames++;
    if (slot.alive && slot.lateFrames >= QualityPool.WATCHDOG_FRAMES) {
      this.kill(slot, "the quality worker was late 5 frames in a row");
    }
  }

  // a worker dead: ended, its tasks of the frame in flight done here, said to onLost (which makes it again)
  kill(slot: Slot, why: string): void {
    if (!slot.worker) {
      return;
    }
    const worker = slot.worker;
    if (slot.alive && slot.index !== this.reserved) {
      this.alive--;
    }
    slot.alive = false;
    slot.worker = null;
    this.dead++;
    this.bakes.forEach((job, id) => {
      if (job.slot === slot.index) {
        this.bakes.delete(id);
        if (job.low) {
          this.lowOut--;
        } else {
          this.urgentOut--;
        }
      }
    });
    if (slot.index === this.reserved) {
      this.lowQueue.length = 0;
    }
    this.readyIs(slot);
    if (worker) {
      worker.terminate();
    }
    const state = this.frame;
    if (state && state.waiting.has(slot.index)) {
      state.waiting.delete(slot.index);
      if (!state.timedOut) {
        this.redo(slot, state);
      }
      this.settle(state);
    }
    slot.restarted = true;
    if (this.options.onLost && !this.destroyed) {
      this.options.onLost(slot.index, why);
    }
  }

  // a worker for a slot whose worker was lost (or that had none): taken, answers its ping before it is used, has its warm-up and the statics again
  adopt(index: number, worker: PoolWorker): void {
    const slot = this.slots[index];
    if (!slot || this.destroyed || slot.worker) {
      worker.terminate();
      return;
    }
    if (slot.restarted) {
      this.dead--;
      this.restarts++;
    }
    this.attach(slot, worker, true);
  }

  // for the tests: a worker failing as onerror says
  fail(index: number): void {
    const slot = this.slots[index];
    if (slot) {
      this.kill(slot, "failed");
    }
  }

  report(): QualityPoolReport {
    return { workers: this.alive, ms: this.lastMs, waitedMs: this.lastWaitedMs, late: this.late, restarts: this.restarts, mode: this.alive > 0 ? "transfer" : "none" };
  }

  // the workers ended and the pool kept (its statics too): a task made over it later (QualityPoolTask's `existing`) gives it workers again, from clean counts; frames are done inline meanwhile
  release(onLost?: (index: number, why: string) => void): void {
    for (const slot of this.slots) {
      if (slot.worker) {
        slot.worker.terminate();
      }
      slot.worker = null;
      slot.alive = false;
      slot.restarted = false;
      slot.lateFrames = 0;
      this.readyIs(slot);
    }
    this.alive = 0;
    this.dead = 0;
    this.restarts = 0;
    this.bakes.clear();
    this.lowQueue.length = 0;
    this.lowOut = 0;
    this.urgentOut = 0;
    this.options.onLost = onLost;
  }

  destroy(): void {
    this.destroyed = true;
    for (const slot of this.slots) {
      if (slot.worker) {
        slot.worker.terminate();
      }
      slot.worker = null;
      slot.alive = false;
      this.readyIs(slot);
    }
    this.alive = 0;
    const state = this.frame;
    if (state) {
      this.frame = null;
      if (state.timer !== null) {
        clearTimeout(state.timer);
      }
      state.resolve(null);
    }
    if (this.options.cleanup) {
      this.options.cleanup();
    }
  }
}

// a worker as the task holds it: the pool's own worker object, which the pool watches (its errors, its late replies): a loss reaches the task through the pool's onLost
class QualityHandle implements TaskWorker {
  onFail: ((why: string | undefined) => void) | null;
  worker: PoolWorker;
  url: string | null;
  constructor(worker: PoolWorker, url: string | null) {
    this.worker = worker;
    this.url = url;
    this.onFail = null;
  }
  close(): void {
    this.worker.terminate();
    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = null;
    }
  }
}

export interface QualityPoolTaskOptions extends TaskOptions {
  // the bundle's URL (or the wallpaper's folder): the workers are made from it
  base?: string;
  // the tests' stand-in for the workers: a promise of a slot's worker (null: none could be made)
  makeWorker?: (slot: number, force: string) => Promise<PoolWorker | null>;
  // the pool's own options (the tests': lateMs, warmupFrames, ...)
  pool?: PoolOptions;
  // a pool kept by an earlier task's stop(true): this task works over it
  existing?: QualityPool;
}

// the quality pool as a ThreadedTask with a slot for each worker: the pool (task.pool) exists from the start with no worker, every frame's work done inline (report().mode "none"),
// a worker made in each slot as soon as it can be and given to the pool (adopt: it answers its ping before it is used); a worker the pool loses is told to the task (onLost), which
// makes it again after 20 ms, 40 ... (as often as it happens: the backoff does the pacing); stop() ends the workers and destroys the pool
export class QualityPoolTask extends ThreadedTask<QualityPool, QualityHandle> {
  pool: QualityPool;
  private base: string;
  private makeWorker: QualityPoolTaskOptions["makeWorker"];

  constructor(count: number, options: QualityPoolTaskOptions = {}) {
    // (the pool tells the task of a loss; the task is made after the pool, so the pool gets a way to it by this holder)
    const holder: { task: QualityPoolTask | null } = { task: null };
    const onLost = (index: number, why: string) => {
      if (holder.task) {
        holder.task.lost(index, why);
      }
    };
    let pool: QualityPool;
    if (options.existing) {
      pool = options.existing;
      pool.release(onLost);
    } else {
      pool = new QualityPool(count, Object.assign({ ping: true, reserveForBakes: count >= 2 }, options.pool || {}, { onLost }));
    }
    super(pool, Object.assign({}, options, { slots: count }));
    holder.task = this;
    this.pool = pool;
    this.base = options.base || "";
    this.makeWorker = options.makeWorker;
  }

  protected spawn(slot: number, force: string): Promise<QualityHandle | null> {
    if (this.makeWorker) {
      return this.makeWorker(slot, force).then((worker) => (worker ? new QualityHandle(worker, null) : null));
    }
    return Workers.start(this.base, { name: "quality", force }).then((made) => (made ? new QualityHandle(made.worker as unknown as PoolWorker, made.url) : null));
  }

  // the worker is the pool's from now on
  protected adopt(slot: number, worker: QualityHandle): void {
    this.pool.adopt(slot, worker.worker);
  }

  // a worker lost to the task first (a kill): the pool drops it too, its tasks of the frame in flight done inline (a loss the pool noticed is already dropped: nothing to do)
  protected dropped(slot: number): void {
    this.pool.fail(slot);
  }

  // keep: the workers end but the pool stays (with its statics) for a task made over it
  stop(keep?: boolean): void {
    super.stop();
    if (keep) {
      this.pool.release();
    } else {
      this.pool.destroy();
    }
  }
}

M.QualityPool = QualityPool;
M.QualityPoolTask = QualityPoolTask;
