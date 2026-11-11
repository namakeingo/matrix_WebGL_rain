// SplashTick: one frame's work of the splashes (models/splashsim.ts) as a stepped model for a SteppedTask (platform/steppedtask.ts): each tick is a frame, driven by one payload (an
// event, applied before the tick): the settings of the frame, the operations asked since the last frame in the order they were asked (landings the rain made, splashes spawned directly,
// a reset) and the frame's time (the splashes then fall back: `advance(time)`). The tick's packet is the impacts the falls made (x, z, weight, for the waves) and, for a model that runs
// in a worker, what the main thread's copy of the simulation needs to keep: the live splashes' serials and counts, the ring's rows of the splashes made in the tick (what the effect
// sends to the GPU).
// `local` is true for the model on the render thread (it runs on the effect's own simulation, which then already has everything: its packet is the impacts only); the worker's
// is a model of its own over a simulation of its own. Applying a worker's packet to the render thread's simulation is SplashTick.apply. snapshot()/restore() cover the simulation, the
// clock and the settings.
// The operations are packed in a Float64Array, OP_STRIDE values each: [kind, ...]: OP_LANDING x, z, r, g, b (r < 0: no colour: white), time, size; OP_SPAWN x, z, count, size, time,
// r, g, b (r < 0: white); OP_RESET; OP_RAIN (the place in the operations where the rain's steps of the tick are made: a model that has a rain does them there, with the payload's `rain`
// part; the one at `rainAt` only, an older one is no more than an entry).
//
// Changelog:
// 2026-11-10: new.
// 2026-11-10: OP_RAIN and the rain's hook (a model built on this one, models/rainsimtick.ts, makes the rain's steps at the operation).
import { M } from "../engine/core";
import { SplashSim } from "./splashsim";
import type { SplashSimSnapshot } from "./splashsim";
import type { StepModel } from "../platform/steppedtask";

const OP_STRIDE = 9;
const OP_LANDING = 1;
const OP_SPAWN = 2;
const OP_RESET = 3;
const OP_RAIN = 4;
// a splash's row of the ring (SplashSim: SPLASH_TEXELS x 4 words)
const ROW = 16;

export interface SplashPayload {
  // the operations (packed, `ops` values used) and the frame's time (null: no advance in this tick)
  ops: Float64Array;
  used: number;
  time: number | null;
  // the settings and the step clock of the frame
  trail: number;
  targetHeight: number;
  noSplashes: boolean;
  debug: boolean;
  from: number;
  base: number;
  rate: number;
  // the rain's part of the tick (models/rainsimtick.ts) and the index in `ops` of the operation it is made at
  rain?: unknown;
  rainAt?: number;
}

export interface SplashPacket {
  // the impacts the splashes' falls made, x, z, weight each
  impacts: Float64Array;
  // the model that made it ran on the render thread: the rest is not given
  local: boolean;
  reset: boolean;
  // the next serial at the last reset of the tick (-1: none): the effect's upload cursor goes there
  resetAt: number;
  count: number;
  nextSerial: number;
  lastStep: number;
  from: number;
  serial: Float64Array;
  // the first serial of the rows, and the ring's rows of the splashes made in the tick (the last RING at most)
  firstNew: number;
  rows: Uint32Array;
}

export interface SplashTickSnapshot {
  step: number;
  sim: SplashSimSnapshot;
  trail: number;
  targetHeight: number;
  noSplashes: boolean;
  debug: boolean;
  from: number;
  base: number;
  rate: number;
}

const EMPTY_F = new Float64Array(0);
const EMPTY_U = new Uint32Array(0);

export class SplashTick implements StepModel<SplashPacket> {
  step: number;
  sim: SplashSim;
  local: boolean;
  protected queue: SplashPayload[];

  constructor(sim: SplashSim, local: boolean) {
    this.sim = sim;
    this.local = local;
    this.step = 0;
    this.queue = [];
  }

  // the packing of one operation into ops at index `at` (values OP_STRIDE a time)
  static landing(ops: Float64Array, at: number, x: number, z: number, color: ArrayLike<number> | undefined, time: number, size: number): void {
    ops[at] = OP_LANDING;
    ops[at + 1] = x;
    ops[at + 2] = z;
    ops[at + 3] = color ? color[0]! : -1;
    ops[at + 4] = color ? color[1]! : -1;
    ops[at + 5] = color ? color[2]! : -1;
    ops[at + 6] = time;
    ops[at + 7] = size;
    ops[at + 8] = 0;
  }

  static spawn(ops: Float64Array, at: number, x: number, z: number, count: number, size: number, time: number, color: ArrayLike<number> | undefined): void {
    ops[at] = OP_SPAWN;
    ops[at + 1] = x;
    ops[at + 2] = z;
    ops[at + 3] = count;
    ops[at + 4] = size;
    ops[at + 5] = time;
    ops[at + 6] = color ? color[0]! : -1;
    ops[at + 7] = color ? color[1]! : -1;
    ops[at + 8] = color ? color[2]! : -1;
  }

  static reset(ops: Float64Array, at: number): void {
    ops[at] = OP_RESET;
  }

  static rain(ops: Float64Array, at: number): void {
    ops[at] = OP_RAIN;
  }

  // the rain's steps of a payload, made at its OP_RAIN operation (none in this model); the impacts they make are pushed to `impacts` (x, z, weight)
  protected rainSteps(_payload: SplashPayload, _impacts: number[]): void {}

  get stride(): number {
    return OP_STRIDE;
  }

  event(payload: unknown): void {
    this.queue.push(payload as SplashPayload);
  }

  run(): SplashPacket {
    this.step++;
    const sim = this.sim;
    const impacts: number[] = [];
    const was = sim.onLand;
    sim.onLand = (x, z, weight) => {
      impacts.push(x, z, weight);
    };
    const firstNew = sim.nextSerial;
    let reset = false;
    let resetAt = -1;
    const color = new Float32Array(3);
    for (const p of this.queue) {
      sim.trail = p.trail;
      sim.targetHeight = p.targetHeight;
      sim.noSplashes = p.noSplashes;
      sim.debug = p.debug;
      const clock = sim.clock;
      clock.from = p.from;
      clock.base = p.base;
      clock.rate = p.rate;
      const ops = p.ops;
      for (let at = 0; at < p.used; at += OP_STRIDE) {
        const kind = ops[at]!;
        if (kind === OP_LANDING) {
          const hasColor = ops[at + 3]! >= 0;
          if (hasColor) {
            color[0] = ops[at + 3]!;
            color[1] = ops[at + 4]!;
            color[2] = ops[at + 5]!;
          }
          sim.fromLanding({ x: ops[at + 1]!, z: ops[at + 2]!, color: hasColor ? color : undefined }, ops[at + 6]!, ops[at + 7]!);
        } else if (kind === OP_SPAWN) {
          const hasColor = ops[at + 6]! >= 0;
          if (hasColor) {
            color[0] = ops[at + 6]!;
            color[1] = ops[at + 7]!;
            color[2] = ops[at + 8]!;
          }
          sim.spawn(ops[at + 1]!, ops[at + 2]!, ops[at + 3]!, ops[at + 4]!, ops[at + 5]!, hasColor ? color : undefined);
        } else if (kind === OP_RESET) {
          sim.reset();
          reset = true;
          resetAt = sim.nextSerial;
        } else if (kind === OP_RAIN && p.rain !== undefined && at === p.rainAt) {
          this.rainSteps(p, impacts);
        }
      }
      if (p.time !== null) {
        sim.advance(p.time);
      }
    }
    this.queue.length = 0;
    sim.onLand = was;
    if (this.local) {
      return { impacts: Float64Array.from(impacts), local: true, reset, resetAt, count: 0, nextSerial: 0, lastStep: 0, from: 0, serial: EMPTY_F, firstNew: 0, rows: EMPTY_U };
    }
    const made = Math.min(sim.nextSerial - firstNew, sim.ring.length / ROW);
    const first = sim.nextSerial - made;
    const rows = new Uint32Array(made * ROW);
    const ringLength = sim.ring.length / ROW;
    for (let k = 0; k < made; k++) {
      const slot = (first + k) % ringLength;
      rows.set(sim.ring.subarray(slot * ROW, (slot + 1) * ROW), k * ROW);
    }
    return {
      impacts: Float64Array.from(impacts),
      local: false,
      reset,
      resetAt,
      count: sim.count,
      nextSerial: sim.nextSerial,
      lastStep: sim.lastStep,
      from: sim.from,
      serial: sim.serial.slice(0, sim.count),
      firstNew: first,
      rows,
    };
  }

  // a worker's packet applied to the render thread's simulation: the counters, the live serials and the ring's rows of the splashes made
  static apply(sim: SplashSim, packet: SplashPacket): void {
    if (packet.local) {
      return;
    }
    sim.count = packet.count;
    sim.nextSerial = packet.nextSerial;
    sim.lastStep = packet.lastStep;
    sim.from = packet.from;
    sim.serial.set(packet.serial);
    const ringLength = sim.ring.length / ROW;
    const made = packet.rows.length / ROW;
    for (let k = 0; k < made; k++) {
      const slot = (packet.firstNew + k) % ringLength;
      sim.ring.set(packet.rows.subarray(k * ROW, (k + 1) * ROW), slot * ROW);
    }
  }

  snapshot(): SplashTickSnapshot {
    const sim = this.sim;
    return { step: this.step, sim: sim.snapshot(), trail: sim.trail, targetHeight: sim.targetHeight, noSplashes: sim.noSplashes, debug: sim.debug, from: sim.clock.from, base: sim.clock.base, rate: sim.clock.rate };
  }

  restore(snapshot: unknown): void {
    const s = snapshot as SplashTickSnapshot;
    const sim = this.sim;
    this.step = s.step;
    this.queue.length = 0;
    sim.restore(s.sim);
    sim.trail = s.trail;
    sim.targetHeight = s.targetHeight;
    sim.noSplashes = s.noSplashes;
    sim.debug = s.debug;
    sim.clock.from = s.from;
    sim.clock.base = s.base;
    sim.clock.rate = s.rate;
  }
}

M.SplashTick = SplashTick;
