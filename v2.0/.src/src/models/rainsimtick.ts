// RainSimTick: the rain's landings wheel (models/rainwheel.ts) and the splashes (models/splashsim.ts) as ONE stepped model for a SteppedTask (platform/steppedtask.ts): each tick is a
// frame. It is the splashes' tick (models/splashtick.ts: the payload's settings, the operations in their order, the frame's time, the splashes' fall) with the rain's steps made at the
// payload's OP_RAIN operation, inside the tick: the wheel's steps (a landing's wave impact, and with the collision plane the splashes it makes, `fromLanding`, made at once: they are
// in the tick, never asked of another thread), the music's scan, and the calls the render thread made to the wheel.
// - The payload's `rain` part (RainPart): the wheel calls and settings set on the render thread since the last frame in their order (RainCall: `before` of them go before the steps,
//   the rest after), each with the view it was made with; the view of the frame, its time, whether a layout is pending (the music's scan waits for it), the layout the scene worker
//   made for a step (RainSwap: swapped in when the steps reach its step, the wheel's adopt and retarget), and the landings' flags (the impact's weight, whether they make splashes, a
//   splash's size).
// - The packet: the impacts in the order the inline code makes them (per landing the rain's, then the falls' of the splashes), the splashes' mirror (SplashTick's), and for a model that
//   runs in a worker (`local` false) what the render thread's copy of the wheel keeps (RainOutState): the counts and the steps, the lives that changed (the rows between the dirty
//   range's ends), the layout when a swap installed it, the phases the music changed, the drops it woke. A local model runs on the render thread's wheel itself: its packet says
//   only whether a swap took place. RainSimTick.applyRain gives a worker's packet to the render thread's wheel. The wheel's internal arrays (the slots) are the worker's: the render
//   thread's copy is complete again whenever it runs the tick (a worker lost: the model restored from a checkpoint and replayed).
// - snapshot()/restore() cover the splashes' tick and the wheel (after a restore everything is owed to the upload: the lives and the layout).
//
// Changelog:
// 2026-11-10: new.
// 2026-11-11: applyRain keeps the applied mean fall valid for the wheel's clock rate (RainWheel.meanFallRate).
import { M } from "../engine/core";
import type { RainWheel, RainWheelSnapshot, DropState, RainView } from "./rainwheel";
import { SplashTick } from "./splashtick";
import type { SplashPacket, SplashPayload, SplashTickSnapshot } from "./splashtick";
import type { SplashSim } from "./splashsim";
import type { FloorKind } from "./floor";

// the pool's size (the lives are 4 numbers a drop)
const COUNT = 65536;

// a call made to the wheel on the render thread: its name, the view it was made with (eyeX, eyeY, tilt, halfFov, yaw; null: none read) and its arguments (copies: the call is kept to
// be run again)
export interface RainCall {
  n: string;
  v: number[] | null;
  a: unknown[];
  // its sequence number (the render thread's wheel has run the calls up to RainWheel.appliedSeq; none: always run)
  q?: number;
}

// the layout the scene worker made and its restart, for a step (workers/sceneworker.ts's RainResult)
export interface RainSwap {
  at: number;
  trail: number;
  layout: Float32Array;
  floor: FloorKind;
  pitch: number;
  eyeHeight: number;
  spawn: { eyeHeight: number; pitch: number; halfFov: number } | null;
  life: Uint32Array;
  slots: Int32Array;
  nextInSlot: Int32Array;
  inWheel: Uint8Array;
  active: number;
  reach: number;
}

export interface RainPart {
  calls: RainCall[];
  before: number;
  view: RainView;
  time: number;
  layoutPending: boolean;
  swap: RainSwap | null;
  // a landing's wave impact (its weight), whether it makes splashes, and their size
  impact: number;
  collide: boolean;
  size: number;
}

// what the render thread's copy of the wheel keeps of a worker's tick
export interface RainOutState {
  local: false;
  swapped: boolean;
  lastStep: number;
  time: number;
  active: number;
  reach: number;
  wanted: number;
  inView: number;
  wokenCount: number;
  musicCredit: number;
  musicAt: number;
  staticAt: number;
  fillPart: number;
  fillFor: string;
  meanFall: number;
  meanFallForLayout: boolean;
  wrongLandings: number;
  layoutPending: boolean;
  layoutDirty: boolean;
  layoutFloor: FloorKind;
  layoutPitch: number;
  layoutEye: number;
  trail: number;
  dirtyFirst: number;
  dirtyLast: number;
  // the lives of the drops dirtyFirst .. dirtyLast (4 a drop)
  lifeRows: Uint32Array;
  // the phases the music changed (drop, phase pairs), the drops newly woken, whether the woken flags were reset first and whether the layout was copied
  phases: Float64Array;
  woke: Int32Array;
  wokenReset: boolean;
  refreshed: boolean;
}

export interface RainOutLocal {
  local: true;
  swapped: boolean;
}

export type RainOut = RainOutLocal | RainOutState;

export interface RainSimPacket extends SplashPacket {
  // null: the payload had no rain part (or the model has no wheel)
  rain: RainOut | null;
}

export interface RainSimSnapshot extends SplashTickSnapshot {
  wheel: RainWheelSnapshot | null;
}

// the calls the wheel takes (RainCall.n); "set" is a field of the settings set, "color" a colour, "spawnByMusic" the music's scan with whether a layout is pending
const CALLS = new Set([
  "adopt", "gateFirst", "rateChanged", "setWave", "setShares", "setMusicLight", "despawn", "wake", "gate", "retarget", "setLife", "dirty", "restart", "settle", "start", "finish", "fade",
  "schedule", "resetTime", "installLayout",
]);

const EMPTY_F = new Float64Array(0);
const EMPTY_I = new Int32Array(0);
const EMPTY_U = new Uint32Array(0);

// a call run on a wheel (the arrays it keeps copied: the call may be run again)
function applyCall(w: RainWheel, c: RainCall): void {
  if (c.q !== undefined) {
    if (c.q <= w.appliedSeq) {
      return;
    }
    w.appliedSeq = c.q;
  }
  const v = c.v;
  if (v) {
    const view = w.view;
    view.eyeX = v[0]!;
    view.eyeY = v[1]!;
    view.tilt = v[2]!;
    view.halfFov = v[3]!;
    view.yaw = v[4]!;
  }
  const a = c.a;
  const wheel = w as unknown as Record<string, unknown>;
  if (c.n === "set") {
    wheel[a[0] as string] = a[1];
  } else if (c.n === "color") {
    w.colors[a[0] as number] = (a[1] as Float32Array).slice();
  } else if (c.n === "spawnByMusic") {
    w.layoutPending = a[1] as boolean;
    w.spawnByMusic(a[0] as number);
  } else if (c.n === "installLayout") {
    w.installLayout((a[0] as Float32Array).slice(), a[1] as number, a[2] as FloorKind, a[3] as number, a[4] as number, a[5] as number | null);
  } else if (c.n === "adopt") {
    const r = a[0] as { life: Uint32Array; slots: Int32Array; nextInSlot: Int32Array; inWheel: Uint8Array; active: number; reach: number };
    w.adopt({ life: r.life.slice(), slots: r.slots.slice(), nextInSlot: r.nextInSlot.slice(), inWheel: r.inWheel.slice(), active: r.active, reach: r.reach });
  } else if (CALLS.has(c.n)) {
    (wheel[c.n] as (...args: unknown[]) => unknown).apply(w, a);
  } else {
    throw new Error("a wheel call that is not known: " + c.n);
  }
}

export class RainSimTick extends SplashTick {
  wheel: RainWheel | null;
  // whether a layout was swapped in during the tick being run
  private swapped: boolean;

  // wheel: the rain's wheel (null: no rain: the splashes' tick alone; the render thread's is given once the rain exists)
  constructor(sim: SplashSim, wheel: RainWheel | null, local: boolean) {
    super(sim, local);
    this.wheel = wheel;
    this.swapped = false;
  }

  // a swap's copy (the arrays copied): the payload holds this, the render thread's wheel keeps the original
  static cloneSwap(r: RainSwap): RainSwap {
    return {
      at: r.at,
      trail: r.trail,
      layout: r.layout.slice(),
      floor: r.floor,
      pitch: r.pitch,
      eyeHeight: r.eyeHeight,
      spawn: r.spawn ? { eyeHeight: r.spawn.eyeHeight, pitch: r.spawn.pitch, halfFov: r.spawn.halfFov } : null,
      life: r.life.slice(),
      slots: r.slots.slice(),
      nextInSlot: r.nextInSlot.slice(),
      inWheel: r.inWheel.slice(),
      active: r.active,
      reach: r.reach,
    };
  }

  // the rain's steps of a payload (SplashTick calls this at the payload's OP_RAIN operation): the calls before, the view and time, the wheel's steps with their landings, the music's
  // scan, the calls after
  protected rainSteps(p: SplashPayload, impacts: number[]): void {
    const w = this.wheel;
    const part = p.rain as RainPart;
    if (!w) {
      return;
    }
    const sim = this.sim;
    const calls = part.calls;
    for (let c = 0; c < part.before; c++) {
      applyCall(w, calls[c]!);
    }
    Object.assign(w.view, part.view);
    w.time = part.time;
    if (w.layout) {
      const clock = w.clock;
      const step = clock.stepAt(part.time);
      // (a jump past what a frame can move, or back: the settled rain from there)
      if (step - w.lastStep > clock.most || step < w.lastStep) {
        w.lastStep = step;
        w.settle();
      }
      let ready = part.swap;
      // (the scene worker's layout in place, at its step: the wheel's adopt and retarget)
      const swapIn = () => {
        const r = ready!;
        ready = null;
        this.swapped = true;
        w.installLayout(r.layout.slice(), r.trail, r.floor, r.pitch, r.eyeHeight, null);
        w.adopt({ life: r.life.slice(), slots: r.slots.slice(), nextInSlot: r.nextInSlot.slice(), inWheel: r.inWheel.slice(), active: r.active, reach: r.reach });
        w.retarget();
      };
      if (ready && ready.at === w.lastStep) {
        swapIn();
      }
      const was = w.onLand;
      const weight = part.impact;
      const collide = part.collide;
      const size = part.size;
      w.onLand = (d: DropState, time: number) => {
        impacts.push(d.x, d.z, weight);
        if (collide) {
          sim.fromLanding(d, time, size);
        }
      };
      try {
        for (let s = w.lastStep + 1; s <= step; s++) {
          w.runStep(s);
          if (ready && ready.at === s) {
            w.lastStep = s;
            swapIn();
          }
        }
        w.lastStep = Math.max(w.lastStep, step);
      } finally {
        w.onLand = was;
      }
      w.layoutPending = part.layoutPending;
      w.spawnByMusic(part.time);
    }
    for (let c = part.before; c < calls.length; c++) {
      applyCall(w, calls[c]!);
    }
  }

  run(): RainSimPacket {
    const w = this.wheel;
    this.swapped = false;
    const keep = !!w && !this.local;
    if (keep) {
      // (what the tick changes is what the packet carries: the dirty range and the trace start empty)
      w!.dirtyFirst = COUNT;
      w!.dirtyLast = -1;
      w!.layoutDirty = false;
      w!.trace = { phases: [], woke: [], wokenReset: false, refreshed: false };
    }
    let packet: SplashPacket;
    let out: RainOut | null;
    try {
      packet = super.run();
      out = this.rainOut(keep);
    } finally {
      if (w) {
        w.trace = null;
      }
    }
    return Object.assign(packet, { rain: out });
  }

  private rainOut(keep: boolean): RainOut | null {
    const w = this.wheel;
    if (!w) {
      return null;
    }
    if (!keep) {
      return { local: true, swapped: this.swapped };
    }
    const trace = w.trace!;
    const from = w.dirtyFirst;
    const to = w.dirtyLast;
    return {
      local: false,
      swapped: this.swapped,
      lastStep: w.lastStep,
      time: w.time,
      active: w.active,
      reach: w.reach,
      wanted: w.wanted,
      inView: w.inView,
      wokenCount: w.wokenCount,
      musicCredit: w.musicCredit,
      musicAt: w.musicAt,
      staticAt: w.staticAt,
      fillPart: w.fillPart,
      fillFor: w.fillFor,
      meanFall: w.meanFall,
      meanFallForLayout: !!w.layout && w.meanFallFor === w.layout,
      wrongLandings: w.wrongLandings,
      layoutPending: w.layoutPending,
      layoutDirty: w.layoutDirty,
      layoutFloor: w.layoutFloor,
      layoutPitch: w.layoutPitch,
      layoutEye: w.layoutEye,
      trail: w.trail,
      dirtyFirst: from,
      dirtyLast: to,
      lifeRows: to >= from ? w.life.slice(from * 4, (to + 1) * 4) : EMPTY_U,
      phases: trace.phases.length ? Float64Array.from(trace.phases) : EMPTY_F,
      woke: trace.woke.length ? Int32Array.from(trace.woke) : EMPTY_I,
      wokenReset: trace.wokenReset,
      refreshed: trace.refreshed,
    };
  }

  // a worker's packet given to the render thread's wheel (a local packet: nothing to do): the counts, the lives that changed, the layout a swap installed (`swap`: the scene worker's
  // result itself, the render thread's own copy), the phases and the drops the music changed. The wheel's internal arrays are the worker's: a swap's are the result's, whole
  static applyRain(wheel: RainWheel, out: RainOut | null, swap?: RainSwap | null): void {
    if (!out || out.local) {
      return;
    }
    if (out.swapped && swap) {
      wheel.installLayout(swap.layout, swap.trail, swap.floor, swap.pitch, swap.eyeHeight, null);
      wheel.slots = swap.slots;
      wheel.nextInSlot = swap.nextInSlot;
      wheel.inWheel = swap.inWheel;
    }
    wheel.lastStep = out.lastStep;
    wheel.time = out.time;
    wheel.active = out.active;
    wheel.reach = out.reach;
    wheel.wanted = out.wanted;
    wheel.inView = out.inView;
    wheel.wokenCount = out.wokenCount;
    wheel.musicCredit = out.musicCredit;
    wheel.musicAt = out.musicAt;
    wheel.staticAt = out.staticAt;
    wheel.fillPart = out.fillPart;
    wheel.fillFor = out.fillFor;
    wheel.meanFall = out.meanFall;
    wheel.wrongLandings = out.wrongLandings;
    wheel.layoutPending = out.layoutPending;
    wheel.layoutFloor = out.layoutFloor;
    wheel.layoutPitch = out.layoutPitch;
    wheel.layoutEye = out.layoutEye;
    wheel.trail = out.trail;
    wheel.layoutDirty = wheel.layoutDirty || out.layoutDirty;
    if (out.dirtyLast >= out.dirtyFirst) {
      wheel.life.set(out.lifeRows, out.dirtyFirst * 4);
      wheel.dirtyFirst = Math.min(wheel.dirtyFirst, out.dirtyFirst);
      wheel.dirtyLast = Math.max(wheel.dirtyLast, out.dirtyLast);
    }
    if (out.wokenReset) {
      wheel.woken.fill(0);
    }
    for (let k = 0; k < out.woke.length; k++) {
      wheel.woken[out.woke[k]!] = 1;
    }
    const layout = wheel.layout;
    if (layout) {
      for (let k = 0; k < out.phases.length; k += 2) {
        layout[out.phases[k]! * 4 + 2] = out.phases[k + 1]!;
      }
      if (out.refreshed) {
        wheel.layout = Float32Array.from(layout);
      }
    }
    wheel.meanFallFor = out.meanFallForLayout ? wheel.layout : null;
    wheel.meanFallRate = wheel.clock.rate;
  }

  snapshot(): RainSimSnapshot {
    return Object.assign(super.snapshot(), { wheel: this.wheel ? this.wheel.snapshot() : null });
  }

  restore(snapshot: unknown): void {
    super.restore(snapshot);
    const s = snapshot as RainSimSnapshot;
    const w = this.wheel;
    if (w && s.wheel) {
      w.restore(s.wheel);
      // (the render thread has uploaded none of what the restored state holds that it does not know: everything is owed)
      w.dirtyFirst = 0;
      w.dirtyLast = COUNT - 1;
      w.layoutDirty = true;
    }
  }
}

M.RainSimTick = RainSimTick;
