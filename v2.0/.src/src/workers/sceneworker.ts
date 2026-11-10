// SceneWorker: the scene's one-off work made in a Web Worker (the bundle's "scene" part), off the main
// thread: the drops' hashes and their check against WebGPU's, the rain's layouts and restarts
// (M.RainLayout), and the characters drawn for the atlas (GlyphAtlas.drawBatch, models/atlas.ts, on
// an OffscreenCanvas). SceneWorker.start(base, { force }) makes it through Workers.start
// (platform/workers.ts: by the bundle's URL, else a Blob of its registered body, else of it
// fetched); it resolves with a client, or null when no worker can be made (all of it then done on
// the main thread). Everything waits by promises; every result comes back by transfer.
// - client.hashes(count, seed): a promise of the script's hashes (the worker keeps its own copy).
// - client.compare(hashes): a promise of { wrong, first, a, b } against the worker's hashes
//   (RainLayout.compare), the array given transferred.
// - client.rain(params): a promise of a layout and a restart at a step ({ generation, at, trail,
//   layout, life, slots, nextInSlot, inWheel, active, reach }), or null when a newer one was asked
//   before it started; params { generation, near, far, trail, wanted, steady, lastStep,
//   eyeHeight, pitch, halfFov }.
// - client.glyphs(params): a promise of the atlas's characters ({ generation, bitmaps (an
//   ImageBitmap a batch of GlyphAtlas.BATCH, its characters one under another), inks, ink (their
//   sum) }), or
//   null when a newer one was asked before it started; params { generation, glyphs (an array of
//   strings), layers }. A worker without OffscreenCanvas rejects it alone (the atlas then drawn on
//   the main thread).
// - A worker that fails (an error, a job it could not do) breaks the client: what it was asked is
//   rejected, onFail(why) is called, and it is asked no more.
// SceneWorker.serve() is the worker's side: its jobs one a task (a MessageChannel's message between
// them, so a newer rain or glyphs job is seen and the older dropped).
//
// Changelog:
// 2026-11-04: TypeScript, a module of src/workers/ (was engine/sceneworker.js).
import { M } from "../engine/core";
import { ClientTask } from "../platform/threadedtask";
import type { ClientTaskOptions } from "../platform/threadedtask";
import type { MadeWorker } from "../platform/workers";
import type { WorkerScope } from "../platform/scope";
import type { CompareResult, RestartResult } from "../models/rainlayout";
import type { FloorKind } from "../models/floor";

// client.rain's params
export interface RainParams {
  generation: number;
  near: number;
  far: number;
  trail: number;
  wanted: number;
  steady: boolean;
  lastStep: number;
  eyeHeight: number;
  pitch: number;
  halfFov: number;
  // the floor the drops fall to (omitted: the water)
  floor?: FloorKind;
  // the plane the falls start from, for React to music (omitted: the world's ceiling)
  spawn?: { eyeHeight: number; pitch: number; halfFov: number } | null;
}

// client.rain's result: a layout and a restart at a step
export interface RainResult extends RestartResult {
  generation: number;
  at: number;
  trail: number;
  layout: Float32Array;
  // the floor kind and the pitch the layout was made for
  floor: FloorKind;
  pitch: number;
  eyeHeight: number;
  spawn: { eyeHeight: number; pitch: number; halfFov: number } | null;
}

// client.glyphs's params
export interface GlyphsParams {
  generation: number;
  glyphs: string[];
  layers: number;
}

// client.glyphs's result: an ImageBitmap a batch, each character's ink and their sum
export interface GlyphsResult {
  generation: number;
  bitmaps: ImageBitmap[];
  inks: Float32Array;
  ink: number;
}

// the messages the main thread sends the worker
type Job =
  | { type: "hashes"; id?: number; count: number; seed: number }
  | { type: "compare"; id?: number; hashes: Uint32Array }
  | { type: "rain"; id?: number; params: RainParams }
  | { type: "glyphs"; id?: number; params: GlyphsParams };

// the messages the worker answers with
interface Answer {
  type: "done" | "failed" | "cancelled";
  id: number;
  result?: unknown;
  error?: string;
  soft?: boolean;
}

// a job waiting for its answer: [resolve, reject]
type Waiting = [(value: unknown) => void, (reason: Error) => void];

// the worker's part of the bundle (its name: src/index.ts)
const JOB = { name: "scene" };

export class SceneWorker {
  onFail: ((why: string | undefined) => void) | null;
  kind: MadeWorker["kind"];
  why: string | undefined;
  waiting: Map<number, Waiting>;
  nextId: number;
  broken: boolean;
  url: string | null;
  worker: Worker;
  constructor(made: MadeWorker) {
    this.worker = made.worker;
    this.kind = made.kind;
    this.url = made.url;
    this.broken = false;
    this.onFail = null;
    this.nextId = 1;
    // (the jobs waiting for an answer, by id: [resolve, reject])
    this.waiting = new Map();
    this.worker.onmessage = (event: MessageEvent<Answer>) => this.receive(event.data);
    this.worker.onerror = (event: ErrorEvent) => this.fail((event && event.message) || "the scene's worker failed");
  }

  static start(base: string, options: { force?: string } = {}) {
    const job = Object.assign({}, JOB, { force: options.force || "" });
    return M.Workers.start(base, job).then((made) => (made ? new SceneWorker(made) : null));
  }

  // ---- the main thread's side ----
  ask<T>(message: Job, transfer?: Transferable[]) {
    if (this.broken) {
      return Promise.reject(new Error("the scene's worker is broken"));
    }
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      this.waiting.set(id, [resolve as (value: unknown) => void, reject]);
      message.id = id;
      this.worker.postMessage(message, transfer || []);
    });
  }

  receive(message: Answer) {
    const waiting = this.waiting.get(message.id);
    if (!waiting) {
      return;
    }
    this.waiting.delete(message.id);
    if (message.type === "failed") {
      waiting[1](new Error(message.error));
      if (!message.soft) {
        this.fail(message.error || "the scene's worker could not do a job");
      }
    } else if (message.type === "cancelled") {
      waiting[0](null);
    } else {
      waiting[0](message.result);
    }
  }

  fail(why: string | undefined) {
    if (this.broken) {
      return;
    }
    this.broken = true;
    this.why = why;
    for (const waiting of this.waiting.values()) {
      waiting[1](new Error(why));
    }
    this.waiting.clear();
    if (this.onFail) {
      this.onFail(why);
    }
  }

  hashes(count: number, seed: number) {
    return this.ask<Uint32Array<ArrayBuffer>>({ type: "hashes", count, seed });
  }

  compare(hashes: Uint32Array<ArrayBuffer>) {
    return this.ask<CompareResult>({ type: "compare", hashes }, [hashes.buffer]);
  }

  rain(params: RainParams) {
    return this.ask<RainResult | null>({ type: "rain", params });
  }

  glyphs(params: GlyphsParams) {
    return this.ask<GlyphsResult | null>({ type: "glyphs", params });
  }

  close() {
    this.onFail = null;
    this.fail("closed");
    this.worker.terminate();
    if (this.url) {
      URL.revokeObjectURL(this.url);
    }
  }

  // ---- the worker's side ----
  static serve() {
    const RL = M.RainLayout;
    const queue: Required<Job>[] = [];
    let pumping = false;
    // (the script's hashes, made once; the newest rain and glyphs jobs asked)
    let hashes: Uint32Array<ArrayBuffer>|null = null;
    const newest = { rain: 0, glyphs: 0 };
    let canvas: OffscreenCanvas|null = null;
    const hashesOf = () => {
      if (!hashes) {
        hashes = RL.hashes(RL.COUNT, RL.SEED);
      }
      return hashes;
    };
    const channel = new MessageChannel();
    const pump = () => {
      if (!pumping && queue.length) {
        pumping = true;
        channel.port2.postMessage(0);
      }
    };
    const answer = (message: { id: number }, result: unknown, transfer?: Transferable[]) => (self as unknown as WorkerScope).postMessage({ type: "done", id: message.id, result }, transfer);
    const run = (message: Required<Job>) => {
      if (message.type === "hashes") {
        const copy = hashesOf().slice();
        answer(message, copy, [copy.buffer]);
      } else if (message.type === "compare") {
        answer(message, RL.compare(message.hashes, hashesOf()));
      } else if (message.type === "rain") {
        const p = message.params;
        if (p.generation < newest.rain) {
          (self as unknown as WorkerScope).postMessage({ type: "cancelled", id: message.id });
          return;
        }
        const kind: FloorKind = p.floor === "screen" ? "screen" : "water";
        const laid = RL.layout({ hashes: hashesOf(), near: p.near, far: p.far, trail: p.trail, spawn: p.spawn || undefined, floor: kind === "screen" ? { kind, eyeHeight: p.eyeHeight, pitch: p.pitch, halfFov: p.halfFov } : undefined });
        const r = RL.restartOf({
          layout: laid.layout,
          slots: laid.slots,
          wanted: p.wanted,
          steady: p.steady,
          lastStep: p.lastStep,
          eyeHeight: p.eyeHeight,
          pitch: p.pitch,
          halfFov: p.halfFov,
          floor: kind,
        });
        const result = Object.assign(r, { generation: p.generation, at: p.lastStep, trail: p.trail, layout: laid.layout, floor: kind, pitch: p.pitch, eyeHeight: p.eyeHeight, spawn: p.spawn || null });
        answer(message, result, [laid.layout.buffer, r.life.buffer, r.slots.buffer, r.nextInSlot.buffer, r.inWheel.buffer]);
      } else if (message.type === "glyphs") {
        const p = message.params;
        if (p.generation < newest.glyphs) {
          (self as unknown as WorkerScope).postMessage({ type: "cancelled", id: message.id });
          return;
        }
        if (typeof OffscreenCanvas !== "function") {
          (self as unknown as WorkerScope).postMessage({ type: "failed", id: message.id, error: "no OffscreenCanvas in the worker", soft: true });
          return;
        }
        const A = M.GlyphAtlas;
        canvas = canvas || new OffscreenCanvas(A.SIZE, A.SIZE * A.BATCH);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const inks = new Float32Array(p.layers);
        const bitmaps: ImageBitmap[] = [];
        let ink = 0;
        for (let first = 0; first < p.layers; first += A.BATCH) {
          ink += A.drawBatch(ctx!, p.glyphs, first, Math.min(A.BATCH, p.layers - first), inks);
          bitmaps.push(canvas.transferToImageBitmap());
        }
        answer(message, { generation: p.generation, bitmaps, inks, ink }, (bitmaps as Transferable[]).concat([inks.buffer]));
      }
    };
    channel.port1.onmessage = () => {
      pumping = false;
      const message = queue.shift();
      if (message) {
        try {
          run(message);
        } catch (error) {
          (self as unknown as WorkerScope).postMessage({ type: "failed", id: message.id, error: String((error && (error as Error).message) || error) });
        }
      }
      pump();
    };
    (self as unknown as WorkerScope).onmessage = (event: MessageEvent<Required<Job> | { type: "ping" }>) => {
      const message = event.data;
      if (message.type === "ping") {
        (self as unknown as WorkerScope).postMessage({ type: "pong" });
        return;
      }
      if (message.type === "rain" || message.type === "glyphs") {
        newest[message.type] = Math.max(newest[message.type], message.params.generation);
      }
      queue.push(message);
      pump();
    };
  }
}

// the scene's worker as a ThreadedTask: the work done inline until the worker is made, then by it, inline again when it fails, the worker made again after 20 ms, 40 ...
// (client(): the worker now, null while none is alive; onChange tells the wallpaper, which gives the rain and the atlas the worker or takes it away)
export interface SceneTaskOptions extends ClientTaskOptions<SceneWorker> {
  base?: string;
}

export class SceneTask extends ClientTask<SceneWorker> {
  constructor(options: SceneTaskOptions = {}) {
    super(Object.assign({}, options, { makeWorker: options.makeWorker || ((_slot: number, force: string) => SceneWorker.start(options.base || "", { force })) }));
  }
}

M.SceneWorker = SceneWorker;
M.SceneTask = SceneTask;
