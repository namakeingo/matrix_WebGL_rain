// The mouse parallax worker: the smoothing of the cursor's follow, off the main thread (the worker part "parallax" of the bundle: src/index.ts routes it here; one state a worker).
// Main -> worker, a message when something changed (the task below): { type: "parallax", x, y (the cursor across the window, -1 to 1, y up), inside (the cursor is in the
//   window), now (ms), on (Mouse parallax), mode ("rotation" or "translation"), amount, delay (0 to 1), limits { yaw, pitch, eyeX, eyeY } (MouseParallax.limitsFor), seed? { x, y } }.
// Worker -> main: { type: "parallax", yaw, pitch, eyeX, eyeY, moving, x, y } (the model's offsets at `now` and its position; moving: it is not at its target yet, so more messages
//   are wanted); { type: "failed", error }.
// A message may carry `seed` { x, y }: the model starts from that position (the inline model hands its position over when the worker is made, and the worker's last position goes
// back to the inline model when the worker fails, so the view does not jump). With `on` false the model is reset and the offsets are 0 (the picture as without the parallax).
// ParallaxTask is a ThreadedTask (platform/threadedtask.ts): inline from the first moment, the worker made as soon as possible and taking over with the position, inline again with it
// when the worker fails (its error, a `failed` message, no answer to the ping), the worker made again after 20 ms, 40, 80 ... The task posts a message only when the cursor, a
// setting or a limit changed or the last reply was still moving, so a view that is still costs no message.
//
// Changelog:
// 2026-11-09: new.
// 2026-11-10: the client became ParallaxTask, a ThreadedTask (the handover, the fallback and the retry are the superclass's); the worker's side is serveTask's; a ping answered.
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import { serveTask } from "../platform/servetask";
import { Workers } from "../platform/workers";
import { ThreadedTask } from "../platform/threadedtask";
import type { TaskOptions, TaskWorker } from "../platform/threadedtask";
import { MouseParallax } from "../models/mouseparallax";
import type { ParallaxLimits } from "../models/mouseparallax";

type Message = Record<string, unknown>;

// the worker's part of the bundle (its name: src/index.ts)
const JOB = { name: "parallax" };

export interface ParallaxSettings {
  on: boolean;
  mode: string;
  amount: number;
  delay: number;
}

export interface ParallaxPointer {
  x: number;
  y: number;
  inside: boolean;
}

export interface ParallaxReply {
  type: "parallax";
  yaw: number;
  pitch: number;
  eyeX: number;
  eyeY: number;
  moving: boolean;
  // the model's position (-1 to 1)
  x: number;
  y: number;
}

export interface ParallaxState {
  model: MouseParallax;
}

export interface ParallaxAnswer {
  reply: Message;
  transfer: Transferable[];
}

function create(): ParallaxState {
  return { model: new MouseParallax() };
}

// the worker's whole reaction to a message
function handle(state: ParallaxState, message: Message): ParallaxAnswer {
  // (Workers.start's ping: a worker that does not answer it is never taken; serveTask answers it before this)
  if (message.type === "ping") {
    return { reply: { type: "pong" }, transfer: [] };
  }
  if (message.type !== "parallax") {
    return { reply: { type: "failed", error: "unknown message kind: " + String(message.type) }, transfer: [] };
  }
  const model = state.model;
  if (!message.on) {
    model.reset();
    return { reply: { type: "parallax", yaw: 0, pitch: 0, eyeX: 0, eyeY: 0, moving: false, x: 0, y: 0 }, transfer: [] };
  }
  const seed = message.seed as { x: number; y: number } | undefined;
  if (seed) {
    model.seed(seed.x, seed.y);
  }
  model.mode = String(message.mode);
  model.amount = message.amount as number;
  model.delay = message.delay as number;
  model.limits = message.limits as ParallaxLimits;
  if (message.inside) {
    model.point(message.x as number, message.y as number);
  } else {
    model.leave();
  }
  model.step(message.now as number);
  return { reply: { type: "parallax", yaw: model.yaw, pitch: model.pitch, eyeX: model.eyeX, eyeY: model.eyeY, moving: model.moving, x: model.x, y: model.y }, transfer: [] };
}

// the worker's own side (src/index.ts, name "parallax")
function serve(): void {
  serveTask(workerScope(), create, handle);
}

// a worker as the task holds it: the link to it (a Worker, or a stand-in in the tests), its replies and its failures
export interface ParallaxLink {
  postMessage(message: Message): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}

class ParallaxHandle implements TaskWorker {
  onFail: ((why: string | undefined) => void) | null;
  link: ParallaxLink;
  constructor(link: ParallaxLink, onReply: (reply: ParallaxReply) => void) {
    this.link = link;
    this.onFail = null;
    link.onmessage = (event) => {
      const data = event.data as Message;
      if (data.type === "failed") {
        this.fail(String(data.error));
      } else if (data.type === "parallax") {
        onReply(data as unknown as ParallaxReply);
      }
    };
    link.onerror = (event) => this.fail((event && event.message) || "the parallax's worker failed");
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

export interface ParallaxTaskOptions extends TaskOptions {
  // the bundle's URL (or the wallpaper's folder): the worker is made from it
  base?: string;
  // the tests' stand-in for the worker: a promise of its link (null: none could be made)
  makeLink?: (slot: number, force: string) => Promise<ParallaxLink | null>;
}

export class ParallaxTask extends ThreadedTask<ParallaxState, ParallaxHandle> {
  private base: string;
  private makeLink: ParallaxTaskOptions["makeLink"];
  private model: ParallaxState;
  // the newest reply not taken, the model's position as of the last reply, a position the next message starts the worker's model from, and what the last message held
  private pending: ParallaxReply | null;
  private last: { x: number; y: number } | null;
  private seeded: { x: number; y: number } | null;
  private sent: string;
  private moving: boolean;

  constructor(options: ParallaxTaskOptions = {}) {
    const state = create();
    super(state, options);
    this.model = state;
    this.base = options.base || "";
    this.makeLink = options.makeLink;
    this.pending = null;
    this.last = null;
    this.seeded = null;
    this.sent = "";
    this.moving = false;
  }

  protected spawn(slot: number, force: string): Promise<ParallaxHandle | null> {
    const link: Promise<ParallaxLink | null> = this.makeLink
      ? this.makeLink(slot, force)
      : Workers.start(this.base, { name: JOB.name, force }).then((made) => (made ? (made.worker as unknown as ParallaxLink) : null));
    return link.then((l) => (l ? new ParallaxHandle(l, (reply) => this.arrive(reply)) : null));
  }

  // the worker takes over from the inline model's position
  protected adopt(_slot: number, _worker: ParallaxHandle, state: unknown): void {
    this.seeded = state as { x: number; y: number } | null;
    this.sent = "";
    this.moving = false;
  }

  protected snapshot(): unknown {
    const m = this.model.model;
    return { x: m.x, y: m.y };
  }

  // the worker lost: the inline model goes on from the worker's last position
  protected dropped(): void {
    if (this.last) {
      this.model.model.seed(this.last.x, this.last.y);
    }
    this.seeded = null;
    this.sent = "";
    this.moving = false;
  }

  private arrive(reply: ParallaxReply): void {
    this.pending = reply;
    this.moving = reply.moving;
    this.last = { x: reply.x, y: reply.y };
  }

  // a frame: inline, the work done now; with a worker, a message when something changed (or the last reply was still moving)
  tick(pointer: ParallaxPointer, now: number, settings: ParallaxSettings, limits: ParallaxLimits): void {
    const message: Message = {
      type: "parallax",
      x: pointer.x,
      y: pointer.y,
      inside: pointer.inside,
      now,
      on: settings.on,
      mode: settings.mode,
      amount: settings.amount,
      delay: settings.delay,
      limits,
    };
    const live = this.liveSlots();
    if (live.length === 0) {
      this.arrive(handle(this.model, message).reply as unknown as ParallaxReply);
      return;
    }
    if (this.seeded) {
      message.seed = this.seeded;
      this.seeded = null;
      this.sent = "";
    }
    // (what the worker's answer depends on besides the time: the cursor, the settings, the limits)
    const key = `${pointer.x},${pointer.y},${pointer.inside},${settings.on},${settings.mode},${settings.amount},${settings.delay},${limits.yaw},${limits.pitch},${limits.eyeX},${limits.eyeY}`;
    if (key === this.sent && !this.moving) {
      return;
    }
    this.sent = key;
    this.workerOf(live[0]!)!.link.postMessage(message);
  }

  // the newest reply not taken yet, or null
  take(): ParallaxReply | null {
    const reply = this.pending;
    this.pending = null;
    return reply;
  }

  // the model's position as of the last reply (null before one)
  position(): { x: number; y: number } | null {
    return this.last;
  }

  seed(x: number, y: number): void {
    this.seeded = { x, y };
  }

  close(): void {
    this.pending = null;
    this.stop();
  }
}

export const ParallaxWorker = { create, handle, serve };

M.ParallaxWorker = ParallaxWorker;
M.ParallaxTask = ParallaxTask;
