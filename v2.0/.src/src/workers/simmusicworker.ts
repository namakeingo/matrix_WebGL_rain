// The Debug simulated music's worker: the generator's arrays (debug/audiogen.ts: AudioGen, 128 values) made off the render thread (the worker part "simmusic" of the bundle: src/index.ts
// routes it here; one generator a worker, made at its first message).
// Main -> worker: { type: "fill", kind, t (s), now (ms, the request's), restore? (the generator's state to continue from: the first message after the worker is taken) }.
// Worker -> main: { type: "simmusic", array (128 values, transferred), now, state (the generator's state after the array) }; { type: "failed", error }.
// SimMusicTask is a ThreadedTask (platform/threadedtask.ts): the array inline from the first moment, the worker taking over with the generator's state, inline again from the state of
// the last answer when it fails, made again after 20 ms, 40 ... With a worker an array arrives in the answer, so a take after a tick may find the one asked a tick before.
//
// Changelog:
// 2026-11-10: new.
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import { serveTask } from "../platform/servetask";
import { Workers } from "../platform/workers";
import { ThreadedTask } from "../platform/threadedtask";
import type { TaskOptions, TaskWorker } from "../platform/threadedtask";
import { AudioGen } from "../debug/audiogen";

type Message = Record<string, unknown>;

const JOB = { name: "simmusic" };

export interface SimMusicReply {
  type: "simmusic";
  array: Float32Array;
  now: number;
  state: number;
}

interface WorkerState {
  gen: AudioGen | null;
  kind: string;
}

function create(): WorkerState {
  return { gen: null, kind: "" };
}

function handle(state: WorkerState, message: Message): { reply: Message; transfer: Transferable[] } | null {
  if (message.type === "ping") {
    return { reply: { type: "pong" }, transfer: [] };
  }
  if (message.type !== "fill") {
    return { reply: { type: "failed", error: "unknown message kind: " + String(message.type) }, transfer: [] };
  }
  const kind = String(message.kind);
  if (!state.gen || state.kind !== kind) {
    state.gen = new AudioGen(kind);
    state.kind = kind;
  }
  if (message.restore !== undefined) {
    state.gen.state = message.restore as number;
  }
  const array = new Float32Array(128);
  state.gen.fill(message.t as number, array);
  return { reply: { type: "simmusic", array, now: message.now, state: state.gen.state }, transfer: [array.buffer] };
}

function serve(): void {
  serveTask(workerScope(), create, handle);
}

export interface SimMusicLink {
  postMessage(message: Message): void;
  onmessage: ((event: MessageEvent | { data: unknown }) => void) | null;
  onerror: unknown;
  terminate(): void;
}

class SimMusicHandle implements TaskWorker {
  onFail: ((why: string | undefined) => void) | null;
  link: SimMusicLink;
  constructor(link: SimMusicLink, onReply: (reply: SimMusicReply) => void) {
    this.link = link;
    this.onFail = null;
    link.onmessage = (event) => {
      const data = (event as { data: Message }).data;
      if (data.type === "failed") {
        this.fail(String(data.error));
      } else if (data.type === "simmusic") {
        onReply(data as unknown as SimMusicReply);
      }
    };
    link.onerror = (event: unknown) => this.fail(((event && (event as ErrorEvent).message) as string) || "the simulated music's worker failed");
  }
  private fail(why: string): void {
    if (this.onFail) {
      this.onFail(why);
    }
  }
  close(): void {
    this.link.onmessage = null;
    this.link.onerror = null;
    this.link.terminate();
  }
}

export interface SimMusicTaskOptions extends TaskOptions {
  base?: string;
  makeLink?: (slot: number, force: string) => Promise<SimMusicLink | null>;
}

export class SimMusicTask extends ThreadedTask<{ gen: AudioGen }, SimMusicHandle> {
  private kind: string;
  private base: string;
  private makeLink: SimMusicTaskOptions["makeLink"];
  private gen: AudioGen;
  private pending: { array: Float32Array; now: number } | null;
  private lastState: number | null;
  private restoring: number | null;

  constructor(kind: string, options: SimMusicTaskOptions = {}) {
    const gen = new AudioGen(kind);
    super({ gen }, options);
    this.kind = kind;
    this.gen = gen;
    this.base = options.base || "";
    this.makeLink = options.makeLink;
    this.pending = null;
    this.lastState = null;
    this.restoring = null;
  }

  protected spawn(slot: number, force: string): Promise<SimMusicHandle | null> {
    const link: Promise<SimMusicLink | null> = this.makeLink
      ? this.makeLink(slot, force)
      : Workers.start(this.base, { name: JOB.name, force }).then((made) => (made ? (made.worker as unknown as SimMusicLink) : null));
    return link.then((l) => (l ? new SimMusicHandle(l, (reply) => this.arrive(reply)) : null));
  }

  // the worker takes over from the inline generator's state
  protected adopt(): void {
    this.restoring = this.gen.state;
    this.lastState = null;
  }

  // the worker lost: the inline generator goes on from the state of the last answer
  protected dropped(): void {
    if (this.lastState !== null) {
      this.gen.state = this.lastState;
    } else if (this.restoring !== null) {
      this.gen.state = this.restoring;
    }
    this.restoring = null;
    this.lastState = null;
  }

  private arrive(reply: SimMusicReply): void {
    this.lastState = reply.state;
    this.pending = { array: reply.array, now: reply.now };
  }

  // the array at the time t (s) asked for: made here, or by the worker (its answer arrives for a later take)
  tick(t: number, now: number): void {
    const live = this.liveSlots();
    if (live.length === 0) {
      const array = new Float32Array(128);
      this.gen.fill(t, array);
      this.pending = { array, now };
      return;
    }
    const message: Message = { type: "fill", kind: this.kind, t, now };
    if (this.restoring !== null) {
      message.restore = this.restoring;
      this.restoring = null;
    }
    this.workerOf(live[0]!)!.link.postMessage(message);
  }

  take(): { array: Float32Array; now: number } | null {
    const r = this.pending;
    this.pending = null;
    return r;
  }
}

export const SimMusicWorker = { create, handle, serve };

M.SimMusicWorker = SimMusicWorker;
M.SimMusicTask = SimMusicTask;
