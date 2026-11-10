// BoltWorker: the bolt's shapes made in Web Workers (BoltWorker.serve, the bundle's "bolt" part),
// off the main thread. BoltWorker.start(base, { workers, force }) makes a pool of min(2, cores - 2)
// workers (at least 1) through Workers.start (platform/workers.ts: by the bundle's URL, else a Blob
// of its registered body, else of it fetched), each told the tests' flag; it resolves
// with a client, or null when no worker can be made (the shapes then made on the main thread, a
// slice at a time). Everything waits by promises.
// - client.make(spec, { generation, at }): a promise of the shape (BoltShape.fromFlat of a
//   worker's flat form, its flash worked out there: shape.flash, and with spec.items the bolt's
//   items built there: shape.items); spec { seed (the shape's own random numbers), top, foot, F,
//   view { width, height, eyeHeight, fieldOfView, pitch }, items (optional: BoltItems' options) }.
//   At most IN_FLIGHT shapes are asked of the workers at once, soonest first (at: when it is
//   wanted), the rest queued here. client.cancel(generation): every make of that generation not
//   yet made resolves with null (the queued here at once; the workers drop theirs not started).
// - client.give(shape): the shape's buffer back to the worker that made it (transferred: detached
//   here; in shared memory, where the page is cross-origin isolated: only its place), the shape
//   marked destroyed; its destroy() does the same.
// - client.stats(): a promise of the pools ({ fresh, pooled, made, given, test, workers: each
//   one's }); client.inFlight(); client.size; client.close().
// - A worker that fails (an error, a shape it could not make) breaks the client: what it was asked
//   is rejected, onFail(why) is called, and it is asked no more (Lightning makes the shapes itself).
// BoltWorker.serve() is the worker's side: its jobs one a task (a MessageChannel's message between
// them, so a cancel is seen), its warm-up when asked (client.warm(), once the page's start is
// done) or before its first job, its buffers back in its pools.
//
// Changelog:
// 2026-11-04: TypeScript, a module of src/workers/ (was engine/boltworker.js).
import { M } from "../engine/core";
import { ClientTask } from "../platform/threadedtask";
import type { ClientTaskOptions } from "../platform/threadedtask";
import type { Camera } from "../engine/camera";
import type { MadeWorker } from "../platform/workers";
import type { FlatShape } from "../models/boltshape";
import type { ItemsOptions, ItemsOut, ItemsBuilt } from "../models/boltitems";

// what a shape is made from (make's spec): its own random numbers' seed, its ends, its main
// channel's size, the view, and the options of its items when they are built with it
export interface BoltSpec {
  seed: number;
  top: number[];
  foot: number[];
  F: number;
  view: { width: number; height: number; eyeHeight: number; fieldOfView: number; pitch: number };
  items?: ItemsOptions;
}

// a shape the workers made (BoltShape.fromFlat's), with its flash (its floats) and its items
export type WorkerShape = FlatShape;

// a worker's pools and counts (stats)
export interface BoltWorkerStats {
  fresh: number;
  pooled: number;
  made: number;
  given: number;
  test: boolean;
}

// a worker of the pool: as Workers.start made it, its place in the pool and its makes asked
interface BoltMember extends MadeWorker {
  index: number;
  inFlight: number;
}

// a make waiting: its spec, its plan's generation, when it is wanted, its promise's ends and the
// worker asked
interface BoltJob {
  id: number;
  spec: BoltSpec;
  generation: number;
  at: number;
  resolve: (shape: WorkerShape | null) => void;
  reject: (error: Error) => void;
  member: BoltMember | null;
}

// the page's messages to a worker
type MakeMessage = { type: "make"; id: number; generation: number; spec: BoltSpec };
type ToWorker =
  | { type: "ping" }
  | { type: "warm" }
  | { type: "init"; test: boolean }
  | MakeMessage
  | { type: "cancel"; generation: number }
  | { type: "give"; buffer: ArrayBuffer | SharedArrayBuffer }
  | { type: "stats"; id: number };

// a worker's messages to the page (its pong is Workers.start's)
type FromWorker =
  | ({ type: "stats"; id: number } & BoltWorkerStats)
  | { type: "shape"; id: number; nums: Float64Array; flash: Float32Array<ArrayBuffer> | null; items: ItemsBuilt | null }
  | { type: "cancelled"; id: number }
  | { type: "failed"; id: number; error: string };

// the worker's global scope (read only in serve, which runs in the bolt's worker; the bundle is
// built with the DOM's types, not the workers')
interface BoltWorkerScope {
  crossOriginIsolated: boolean;
  postMessage(message: FromWorker | { type: "pong" }, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
}
declare const self: BoltWorkerScope;

// the shapes asked of the workers at once
const IN_FLIGHT = 3;
// the worker's part of the bundle (its name: src/index.ts)
const JOB = { name: "bolt" };

export class BoltWorker {
  onFail: ((why: string | undefined) => void) | null;
  kind: MadeWorker["kind"];
  why: string | undefined;
  asked: Map<number, (stats: BoltWorkerStats) => void>;
  jobs: Map<number, BoltJob>;
  queue: BoltJob[];
  nextId: number;
  broken: boolean;
  size: number;
  members: BoltMember[];
  // the makes asked of the workers at once
  limit: number;
  constructor(members: MadeWorker[], limit = IN_FLIGHT) {
    this.limit = limit;
    this.members = members as BoltMember[];
    this.size = members.length;
    this.kind = members[0].kind;
    this.broken = false;
    this.onFail = null;
    this.nextId = 1;
    // (the makes not yet asked of a worker, soonest first; every make waiting, by id)
    this.queue = [];
    this.jobs = new Map();
    // (the stats asked, by id)
    this.asked = new Map();
    (members as BoltMember[]).forEach((member: BoltMember, index: number) => {
      member.index = index;
      member.inFlight = 0;
      member.worker.onmessage = (event: MessageEvent<FromWorker>) => this.receive(member, event.data);
      member.worker.onerror = (event: ErrorEvent) => this.fail((event && event.message) || "the bolt's worker failed");
      member.worker.postMessage({ type: "init", test: !!M.TEST });
    });
  }

  // one worker as a client of its own (a slot of BoltTask): its queue, its cancels, its buffers
  static single(base: string, options: { force?: string; limit?: number } = {}): Promise<BoltWorker | null> {
    return M.Workers.start(base, Object.assign({}, JOB, { force: options.force || "" })).then((made) => (made ? new BoltWorker([made], options.limit) : null));
  }

  static start(base: string, options: { workers?: number; force?: string } = {}): Promise<BoltWorker | null> {
    const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 2;
    const count = options.workers || Math.max(1, Math.min(2, cores - 2));
    const job = Object.assign({}, JOB, { force: options.force || "" });
    return M.Workers.start(base, job).then((first) => {
      if (!first) {
        return null;
      }
      // (the others the same way as the first)
      const same = Object.assign({}, job, { force: first.kind === "url" ? job.force : "blob" });
      const more: Promise<MadeWorker | null>[] = [];
      for (let k = 1; k < count; k++) {
        more.push(M.Workers.start(base, same));
      }
      return Promise.all(more).then((others) => new BoltWorker([first].concat(others.filter(Boolean) as MadeWorker[])));
    });
  }

  // ---- the main thread's side ----
  make(spec: BoltSpec, options: { generation?: number; at?: number } = {}): Promise<WorkerShape | null> {
    if (this.broken) {
      return Promise.reject(new Error("the bolt's worker is broken"));
    }
    return new Promise<WorkerShape | null>((resolve, reject) => {
      const job: BoltJob = { id: this.nextId++, spec, generation: options.generation || 0, at: options.at === undefined ? Infinity : options.at, resolve, reject, member: null };
      this.jobs.set(job.id, job);
      let k = this.queue.length;
      while (k > 0 && this.queue[k - 1].at > job.at) {
        k--;
      }
      this.queue.splice(k, 0, job);
      this.dispatch();
    });
  }

  inFlight() {
    let n = 0;
    for (const member of this.members) {
      n += member.inFlight;
    }
    return n;
  }

  // the soonest queued asked of the least busy workers, up to IN_FLIGHT in all
  dispatch() {
    while (!this.broken && this.queue.length && this.inFlight() < this.limit) {
      const job = this.queue.shift()!;
      let member = this.members[0];
      for (const m of this.members) {
        if (m.inFlight < member.inFlight) {
          member = m;
        }
      }
      job.member = member;
      member.inFlight++;
      member.worker.postMessage({ type: "make", id: job.id, generation: job.generation, spec: job.spec });
    }
  }

  cancel(generation: number) {
    for (let k = this.queue.length - 1; k >= 0; k--) {
      const job = this.queue[k];
      if (job.generation === generation) {
        this.queue.splice(k, 1);
        this.jobs.delete(job.id);
        job.resolve(null);
      }
    }
    for (const member of this.members) {
      member.worker.postMessage({ type: "cancel", generation });
    }
  }

  receive(member: BoltMember, message: FromWorker) {
    if (message.type === "stats") {
      const done = this.asked.get(message.id);
      this.asked.delete(message.id);
      if (done) {
        done({ fresh: message.fresh, pooled: message.pooled, made: message.made, given: message.given, test: message.test });
      }
      return;
    }
    const job = this.jobs.get(message.id);
    if (!job) {
      return;
    }
    this.jobs.delete(message.id);
    member.inFlight--;
    if (message.type === "shape") {
      const shape: WorkerShape = M.BoltShape.fromFlat({ nums: message.nums });
      shape.workerIndex = member.index;
      shape.flash = message.flash || null;
      shape.items = message.items || null;
      shape.destroy = () => this.give(shape);
      job.resolve(shape);
    } else if (message.type === "cancelled") {
      job.resolve(null);
    } else {
      job.reject(new Error(message.error));
      this.fail(message.error || "the bolt's worker could not make a shape");
    }
    this.dispatch();
  }

  fail(why: string | undefined) {
    if (this.broken) {
      return;
    }
    this.broken = true;
    this.why = why;
    for (const job of this.jobs.values()) {
      job.reject(new Error(why));
    }
    this.jobs.clear();
    this.queue.length = 0;
    if (this.onFail) {
      this.onFail(why);
    }
  }

  // a shape's buffer back to the worker that made it, the shape destroyed
  give(shape: { destroyed: boolean; workerIndex?: number; flat?: Float64Array } | null) {
    if (!shape || shape.destroyed) {
      return;
    }
    shape.destroyed = true;
    const member = this.members[shape.workerIndex!] || this.members[0];
    const buffer = shape.flat && shape.flat.buffer;
    if (buffer && buffer.byteLength && !this.broken) {
      const shared = typeof SharedArrayBuffer === "function" && buffer instanceof SharedArrayBuffer;
      member.worker.postMessage({ type: "give", buffer }, shared ? [] : [buffer as ArrayBuffer]);
    }
  }

  // each worker's warm-up (its shapes' code compiled, its pools filled): asked when the page's own
  // start is done, so it does not compete with it; else done before a worker's first job
  warm() {
    for (const member of this.members) {
      member.worker.postMessage({ type: "warm" });
    }
  }

  stats(): Promise<BoltWorkerStats & { workers: BoltWorkerStats[] }> {
    return Promise.all(this.members.map((member: BoltMember) => new Promise<BoltWorkerStats>((done) => {
      const id = this.nextId++;
      this.asked.set(id, done);
      member.worker.postMessage({ type: "stats", id });
    }))).then((workers) => {
      const sum = (key: "fresh" | "pooled" | "made" | "given") => workers.reduce((x, w) => x + w[key], 0);
      return { fresh: sum("fresh"), pooled: sum("pooled"), made: sum("made"), given: sum("given"), test: workers.every((w) => w.test), workers };
    });
  }

  close() {
    this.onFail = null;
    this.fail("closed");
    for (const member of this.members) {
      member.worker.terminate();
      if (member.url) {
        URL.revokeObjectURL(member.url);
      }
    }
  }

  // ---- the worker's side ----
  static serve() {
    // (the jobs waiting, one run a task; its counts)
    const queue: MakeMessage[] = [];
    let pumping = false;
    let made = 0;
    let given = 0;
    let warmed = false;
    // (in shared memory where the page is cross-origin isolated: the flat forms' buffers by
    // their size)
    const shared = !!self.crossOriginIsolated && typeof SharedArrayBuffer === "function";
    const sharedPool = new Map<number, SharedArrayBuffer[]>();
    const alloc = shared
      ? (n: number) => {
        let size = 8;
        while (size < n) {
          size *= 2;
        }
        const list = sharedPool.get(size);
        const buffer = list && list.length ? list.pop()! : new SharedArrayBuffer(size * 8);
        return new Float64Array(buffer, 0, n);
      }
      : undefined;
    const channel = new MessageChannel();
    const pump = () => {
      if (!pumping && queue.length) {
        pumping = true;
        channel.port2.postMessage(0);
      }
    };
    const run = (job: MakeMessage) => {
      if (!warmed) {
        warmed = true;
        M.BoltShape.warm();
      }
      try {
        const spec = job.spec;
        const view: Camera = Object.create(M.Camera.prototype);
        view.width = spec.view.width;
        view.height = spec.view.height;
        view.eyeHeight = spec.view.eyeHeight;
        view.fieldOfView = spec.view.fieldOfView;
        view.pitch = spec.view.pitch;
        view.version = 0;
        const shape = M.BoltShape.make(spec.top, spec.foot, M.seededRandom(spec.seed), spec.F, view);
        const flat = M.BoltShape.toFlat(shape, alloc);
        const flash = M.Flash ? M.Flash.of(shape).floats : null;
        const transfer = flat.transfer.slice();
        if (flash) {
          transfer.push(flash.buffer);
        }
        let items: ItemsOut | null = null;
        if (spec.items && M.BoltItems) {
          items = {};
          M.BoltItems.build(shape, spec.items, items);
          for (const key of Object.keys(items) as (keyof ItemsOut)[]) {
            if (items[key] && (items[key] as { buffer?: unknown }).buffer instanceof ArrayBuffer) {
              transfer.push((items[key] as { buffer: ArrayBuffer }).buffer);
            }
          }
        }
        shape.destroy!();
        made++;
        self.postMessage({ type: "shape", id: job.id, nums: flat.nums, flash, items: items as ItemsBuilt | null }, transfer);
      } catch (error) {
        self.postMessage({ type: "failed", id: job.id, error: String((error && (error as Error).message) || error) });
      }
    };
    channel.port1.onmessage = () => {
      pumping = false;
      const job = queue.shift();
      if (job) {
        run(job);
      }
      pump();
    };
    self.onmessage = (event) => {
      const message = event.data;
      if (message.type === "ping") {
        self.postMessage({ type: "pong" });
      } else if (message.type === "warm") {
        // (the warm-up when the page asks, once its own start is done; else before the first job)
        if (!warmed) {
          warmed = true;
          M.BoltShape.warm();
        }
      } else if (message.type === "init") {
        M.TEST = !!message.test;
      } else if (message.type === "make") {
        queue.push(message);
        pump();
      } else if (message.type === "cancel") {
        for (let k = queue.length - 1; k >= 0; k--) {
          if (queue[k].generation === message.generation) {
            self.postMessage({ type: "cancelled", id: queue[k].id });
            queue.splice(k, 1);
          }
        }
      } else if (message.type === "give") {
        given++;
        const buffer = message.buffer;
        if (shared && buffer instanceof SharedArrayBuffer) {
          const size = buffer.byteLength / 8;
          if (!sharedPool.has(size)) {
            sharedPool.set(size, []);
          }
          sharedPool.get(size)!.push(buffer);
        } else {
          M.BoltShape.giveBuffer(buffer);
        }
      } else if (message.type === "stats") {
        self.postMessage({ type: "stats", id: message.id, fresh: M.BoltShape.fresh(), pooled: M.BoltShape.pooled(), made, given, test: !!M.TEST });
      }
    };
  }
}

M.BoltWorker = BoltWorker;
// what Lightning asks of the bolt's workers (a BoltWorker or the BoltTask): its shapes made by them, a generation cancelled, whether they are there (broken: none: it makes them itself)
export type BoltPool = Pick<BoltWorker, "make" | "cancel" | "broken">;

export interface BoltTaskOptions extends ClientTaskOptions<BoltWorker> {
  base?: string;
}

// the bolt's shapes as a ThreadedTask with a slot for each worker of the pool (min(2, cores - 2), at least 1): each slot a worker of its own with its own backoff (a BoltWorker of
// one worker), behind the facade Lightning uses. `broken` is true while no slot has a worker: Lightning makes the shapes itself, a slice at a time, as it always has; a worker lost
// rejects the makes it had in flight (Lightning makes those itself too) and the other slots go on; a slot's worker is tried again after 20 ms, 40 ...
export class BoltTask extends ClientTask<BoltWorker> {
  private warmWanted: boolean;

  constructor(options: BoltTaskOptions = {}) {
    const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 2;
    const slots = options.slots || Math.max(1, Math.min(2, cores - 2));
    const limit = Math.max(1, Math.ceil(IN_FLIGHT / slots));
    super(Object.assign({}, options, { slots, makeWorker: options.makeWorker || ((_slot: number, force: string) => BoltWorker.single(options.base || "", { force, limit })) }));
    this.warmWanted = false;
  }

  protected adopt(slot: number, worker: BoltWorker): void {
    super.adopt(slot, worker);
    if (this.warmWanted) {
      worker.warm();
    }
  }

  // no worker alive: the shapes are made by Lightning
  get broken(): boolean {
    return this.inline;
  }

  get size(): number {
    return this.alive;
  }

  get kind(): MadeWorker["kind"] | "" {
    const live = this.liveSlots();
    return live.length ? this.client(live[0])!.kind : "";
  }

  // the live clients, the least busy first
  private live(): BoltWorker[] {
    return this.liveSlots().map((slot) => this.client(slot)!).sort((a, b) => a.inFlight() - b.inFlight());
  }

  make(spec: BoltSpec, options: { generation?: number; at?: number } = {}): Promise<WorkerShape | null> {
    const live = this.live();
    if (live.length === 0) {
      return Promise.reject(new Error("no worker of the bolt's is alive"));
    }
    return live[0]!.make(spec, options);
  }

  cancel(generation: number): void {
    for (const client of this.live()) {
      client.cancel(generation);
    }
  }

  inFlight(): number {
    let n = 0;
    for (const client of this.live()) {
      n += client.inFlight();
    }
    return n;
  }

  // each live worker's warm-up (and the ones made later: asked once, done for each when it is adopted)
  warm(): void {
    this.warmWanted = true;
    for (const client of this.live()) {
      client.warm();
    }
  }

  stats(): Promise<BoltWorkerStats & { workers: BoltWorkerStats[] }> {
    return Promise.all(this.live().map((client) => client.stats())).then((all) => {
      const workers = all.reduce((list, one) => list.concat(one.workers), [] as BoltWorkerStats[]);
      const sum = (key: "fresh" | "pooled" | "made" | "given") => workers.reduce((x, w) => x + w[key], 0);
      return { fresh: sum("fresh"), pooled: sum("pooled"), made: sum("made"), given: sum("given"), test: workers.every((w) => w.test), workers };
    });
  }

  close(): void {
    this.stop();
  }
}

M.BoltTask = BoltTask;

