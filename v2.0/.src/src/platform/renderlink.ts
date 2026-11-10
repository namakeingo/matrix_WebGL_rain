// RenderLink: the link between the page and the renderer's worker (no GL, no page objects, the
// same script on both sides).
// - where(env): where the renderer runs, { at: "worker" | "page", why }: on the page with the
//   tests (window.Matrix3DTest: their drawing is synchronous), without OffscreenCanvas (or its
//   transferControlToOffscreen), without Worker; else in a worker. usable(pong): a worker is used
//   only when its answer to the ping says WebGL 2.0 works in it.
// - sharable(): a SharedArrayBuffer can be shared (it exists and the page is cross-origin
//   isolated).
// - State: the page's size and flags, [seq, width, height, paused, hidden, panelWidth,
//   panelHeight] in an Int32Array, written and read with Atomics and a sequence number (a read
//   tried again when the sequence moved while it read). Over a SharedArrayBuffer where sharable:
//   the page writes, the worker reads at the start of a frame. Else over an ArrayBuffer of the
//   worker's own, which the page's messages write: the worker reads it the same way either way.
// - mirror(target, source): source's values into target in place, its nested objects kept (the
//   page's window.Support, which tests and the readout hold, from the worker's report).
// - Forward: the page's side of Wallpaper Engine's calls: every setting's last value kept from the
//   start, nothing sent before attach(post), then one message a call, in order; snapshot() for the
//   worker's init, replay(target) for a renderer made again on the page.
//
// Changelog:
// 2026-11-04: TypeScript, a module of src/platform/ (was engine/renderlink.js).
import { M } from "../engine/core";
import type { WallpaperControl } from "./page";
import type { WallpaperProperties, GeneralProperties } from "../globals";
import type { HdrReport } from "./support";

// a message of the page's to the renderer: Forward's calls, the page's sizes (when the state
// block is not shared) and Wallpaper Engine's audio arrays
export type ForwardMessage =
  | { type: "properties"; properties: WallpaperProperties }
  | { type: "general"; properties: GeneralProperties }
  | { type: "paused"; paused: boolean }
  | { type: "hidden"; hidden: boolean }
  | { type: "state"; width: number; height: number; panelWidth: number; panelHeight: number }
  | { type: "audio"; array: Float32Array }
  | { type: "pointer"; x: number; y: number; inside: boolean }
  | { type: "hdr"; report: HdrReport };

// what State.read fills out
export interface StateValues {
  width: number;
  height: number;
  paused: boolean;
  hidden: boolean;
  panelWidth: number;
  panelHeight: number;
  seq?: number;
}

// every call Forward kept (its snapshot, for the worker's init)
export interface ForwardSnapshot {
  properties: WallpaperProperties;
  general: GeneralProperties;
  paused: boolean;
  hidden: boolean;
}

// what decides where the renderer runs (RenderLink.where)
export interface RenderEnvironment {
  test: boolean;
  offscreenCanvas: boolean;
  transfer: boolean;
  worker: boolean;
}

// where the renderer runs, and why not in a worker
export interface RenderPlace {
  at: "page" | "worker";
  why: string;
}

// the state's fields (Int32 each)
const SEQ = 0;
const WIDTH = 1;
const HEIGHT = 2;
const PAUSED = 3;
const HIDDEN = 4;
const PANEL_WIDTH = 5;
const PANEL_HEIGHT = 6;
const FIELDS = 8;
// a read tried at most this often while the writer moves the sequence
const TRIES = 8;

const whole = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

class State {
  buffer: ArrayBuffer | SharedArrayBuffer;
  shared: boolean;
  seen: number;
  view: Int32Array<ArrayBuffer | SharedArrayBuffer>;
  // shared: true for a SharedArrayBuffer where sharable; or the buffer of the other side
  constructor(shared: boolean | ArrayBuffer | SharedArrayBuffer | null) {
    if (shared instanceof ArrayBuffer || (typeof SharedArrayBuffer === "function" && shared instanceof SharedArrayBuffer)) {
      this.buffer = shared;
    } else {
      this.buffer = shared && RenderLink.sharable() ? new SharedArrayBuffer(FIELDS * 4) : new ArrayBuffer(FIELDS * 4);
    }
    this.shared = typeof SharedArrayBuffer === "function" && this.buffer instanceof SharedArrayBuffer;
    this.view = new Int32Array(this.buffer);
    // (the sequence this side read last)
    this.seen = 0;
  }

  // writes the values (panel's size optional: kept when not given); returns the new sequence
  write(width: number, height: number, paused: boolean, hidden: boolean, panelWidth?: number, panelHeight?: number): number {
    const v = this.view;
    Atomics.store(v, WIDTH, whole(width));
    Atomics.store(v, HEIGHT, whole(height));
    Atomics.store(v, PAUSED, paused ? 1 : 0);
    Atomics.store(v, HIDDEN, hidden ? 1 : 0);
    if (panelWidth !== undefined) {
      Atomics.store(v, PANEL_WIDTH, whole(panelWidth));
      Atomics.store(v, PANEL_HEIGHT, whole(panelHeight));
    }
    return Atomics.add(v, SEQ, 1) + 1;
  }

  // fills out { width, height, paused, hidden, panelWidth, panelHeight, seq }; true when
  // something was written since this side's last read
  read(out: StateValues): boolean {
    const v = this.view;
    let seq = 0;
    for (let k = 0; k < TRIES; k++) {
      seq = Atomics.load(v, SEQ);
      out.width = Atomics.load(v, WIDTH);
      out.height = Atomics.load(v, HEIGHT);
      out.paused = Atomics.load(v, PAUSED) === 1;
      out.hidden = Atomics.load(v, HIDDEN) === 1;
      out.panelWidth = Atomics.load(v, PANEL_WIDTH);
      out.panelHeight = Atomics.load(v, PANEL_HEIGHT);
      if (Atomics.load(v, SEQ) === seq) {
        break;
      }
    }
    out.seq = seq;
    const changed = seq !== this.seen;
    this.seen = seq;
    return changed;
  }
}

class Forward {
  properties: WallpaperProperties;
  post: ((message: ForwardMessage) => void) | null;
  hidden: boolean;
  paused: boolean;
  general: GeneralProperties;
  constructor() {
    this.properties = {};
    this.general = {};
    this.paused = false;
    this.hidden = false;
    this.post = null;
  }

  attach(post: ((message: ForwardMessage) => void) | null) {
    this.post = post;
  }

  send(message: ForwardMessage) {
    if (this.post) {
      this.post(message);
    }
  }

  applyUserProperties(p: WallpaperProperties) {
    Object.assign(this.properties, p);
    this.send({ type: "properties", properties: p });
  }

  applyGeneralProperties(p: GeneralProperties) {
    Object.assign(this.general, p);
    this.send({ type: "general", properties: p });
  }

  setPaused(paused: boolean) {
    this.paused = !!paused;
    this.send({ type: "paused", paused: this.paused });
  }

  setHidden(hidden: boolean) {
    this.hidden = !!hidden;
    this.send({ type: "hidden", hidden: this.hidden });
  }

  snapshot(): ForwardSnapshot {
    return { properties: Object.assign({}, this.properties), general: Object.assign({}, this.general), paused: this.paused, hidden: this.hidden };
  }

  // everything kept given to a renderer (its own listener's calls)
  replay(target: WallpaperControl) {
    if (Object.keys(this.properties).length) {
      target.applyUserProperties(Object.assign({}, this.properties));
    }
    if (Object.keys(this.general).length) {
      target.applyGeneralProperties(Object.assign({}, this.general));
    }
    target.setPaused(this.paused);
    if (target.setHidden) {
      target.setHidden(this.hidden);
    }
  }
}

const plain = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);

export const RenderLink = {
  State,
  Forward,

  where(env: RenderEnvironment): RenderPlace {
    if (env.test) {
      return { at: "page", why: "the tests" };
    }
    if (!env.offscreenCanvas || !env.transfer) {
      return { at: "page", why: "no OffscreenCanvas" };
    }
    if (!env.worker) {
      return { at: "page", why: "no Worker" };
    }
    return { at: "worker", why: "" };
  },

  usable(pong: { webgl2?: unknown } | null | undefined): boolean {
    return !!(pong && pong.webgl2 === true);
  },

  sharable(): boolean {
    return typeof SharedArrayBuffer === "function" && typeof crossOriginIsolated !== "undefined" && !!crossOriginIsolated;
  },

  mirror<T extends object>(target: T, source: object): T {
    for (const [key, value] of Object.entries(source)) {
      if (plain(value) && plain((target as Record<string, unknown>)[key])) {
        RenderLink.mirror((target as Record<string, object>)[key], value as object);
      } else {
        (target as Record<string, unknown>)[key] = value;
      }
    }
    return target;
  },
};

M.RenderLink = RenderLink;
