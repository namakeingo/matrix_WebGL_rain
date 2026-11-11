// SplashSim: the splashes' simulation, pure (no GL, no page: it runs in a worker too). Where a drop lands, 2 to 5 characters are thrown up, each 30% to 70% of its drop's size, at most
// 60 degrees from straight up in any way round, flying under gravity (worked out exactly from their start, not stepped). The splashes in the air are kept in typed arrays (at most MOST,
// in the order they came; when there is no room the oldest go first, all those a landing needs at once), with no object made for one. Each is also written once into its slot of a ring
// of RING splashes (SPLASH_TEXELS texels a splash: its start, its speed, its size and its colour as float bits; its first stamp's step, its count of stamps and its glyph seed as
// unsigned integers; its first stamp's time after its start and the steps' rate then): the ring is what the effect sends to the GPU (from its `sent` serial to nextSerial), and what
// the vertex shader places the stamps from.
// Falling back, each makes an impact of weight IMPACT on the water: `onLand(x, z, weight)` is called inline by `fall` (the effect gives the waves' add); a caller that wants them
// collected gives a callback that pushes them into an array.
// The random draws come from a Mulberry (M.Mulberry: its state `a` in the open), in a fixed order: a landing's number of splashes; then for each splash its launch energy, tilt,
// direction round, size and glyph seed. `fall(time)` is time-based (the frame's exact time is an input of the call); the stamps of a splash are the step clock's (`clock`, the rain's,
// shared and owned by the caller).
// snapshot()/restore(snapshot) give back everything the next call depends on (the live splashes' arrays, the ring, the counters, the generator's state); the clock and the settings
// (trail, targetHeight, noSplashes, debug) are the caller's inputs and are not in it.
//
// Changelog:
// 2026-11-10: new, from effects/splashes.ts (the arrays, the draws, the ring's CPU side, the falls and the steps moved on to), the effect keeping the GL side.
import { M, Mulberry } from "../engine/core";
import { SplashLaunch } from "./splashlaunch";
import type { StepClock } from "../engine/clock";

// a splash's values kept a splash each (FIELDS), in arrays of MOST
type Field = "x0" | "z0" | "t0" | "vx" | "vy" | "vz" | "size" | "land" | "serial";

// the place and colour a drop landed with (Rain.dropAt's description of it)
export interface SplashLanding {
  x: number;
  z: number;
  color: Float32Array | undefined;
}

// what snapshot() gives: plain data (typed arrays copied)
export interface SplashSimSnapshot {
  count: number;
  nextSerial: number;
  lastStep: number;
  from: number;
  rng: number;
  x0: Float64Array;
  z0: Float64Array;
  t0: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  vz: Float64Array;
  size: Float64Array;
  land: Float64Array;
  serial: Float64Array;
  landed: Uint8Array;
  seeds: Uint32Array;
  // the whole ring (RING x SPLASH_TEXELS x 4 words)
  ring: Uint32Array;
}

const GRAVITY = 9.81;
// the Splash height's default target (m): the average height of a splash thrown straight up
const TARGET_HEIGHT = 0.15;
// the trail's steps at the default Trail length (15)
const TRAIL = 6;
const MOST = 4096;
// the ring of splashes (the span drawn at most) and each splash's texels (16 values)
const RING = 2 * MOST;
const SPLASH_TEXELS = 4;
const IMPACT = 0.35;
const WHITE = Float32Array.of(1, 1, 1);
// a splash's values: where and when it starts, its speed, its size, when it falls back, its serial number (its slot in the ring: serial % RING)
const FIELDS: Field[] = ["x0", "z0", "t0", "vx", "vy", "vz", "size", "land", "serial"];

export class SplashSim {
  static GRAVITY = GRAVITY;
  static MOST = MOST;
  static RING = RING;
  static SPLASH_TEXELS = SPLASH_TEXELS;
  static IMPACT = IMPACT;
  static TRAIL = TRAIL;
  static TARGET_HEIGHT = TARGET_HEIGHT;

  // a splash's stamps, from its start t0 to its fall back at land, by a step clock's steps: [the first step whose time is at its start or after, as an unsigned integer; the steps
  // stamped from it (those before its fall back); the first step's time after its start] (into `out`)
  static stampsOf(clock: StepClock, t0: number, land: number, out: Float64Array = new Float64Array(3)): Float64Array {
    let first = Math.ceil(clock.at(t0));
    while (clock.timeOf(first - 1) >= t0) {
      first--;
    }
    while (clock.timeOf(first) < t0) {
      first++;
    }
    let end = Math.max(first, Math.ceil(clock.at(land)));
    while (end > first && clock.timeOf(end - 1) >= land) {
      end--;
    }
    while (clock.timeOf(end) < land) {
      end++;
    }
    out[0] = first >>> 0;
    out[1] = end - first;
    out[2] = clock.timeOf(first) - t0;
    return out;
  }

  x0: Float64Array<ArrayBuffer>;
  z0: Float64Array<ArrayBuffer>;
  t0: Float64Array<ArrayBuffer>;
  vx: Float64Array<ArrayBuffer>;
  vy: Float64Array<ArrayBuffer>;
  vz: Float64Array<ArrayBuffer>;
  size: Float64Array<ArrayBuffer>;
  land: Float64Array<ArrayBuffer>;
  serial: Float64Array<ArrayBuffer>;
  landed: Uint8Array<ArrayBuffer>;
  seeds: Uint32Array<ArrayBuffer>;
  count: number;
  // the ring as sent to the GPU (its values as floats and as unsigned integers) and the next serial number
  ring: Uint32Array<ArrayBuffer>;
  ringFloats: Float32Array<ArrayBuffer>;
  nextSerial: number;
  // a splash's stamps (SplashSim.stampsOf's first step, count, offset)
  stamps: Float64Array<ArrayBuffer>;
  // the steps moved on to: the last, and the last jump's (no stamps up to it)
  lastStep: number;
  from: number;
  rng: Mulberry;
  seed: number;
  clock: StepClock;
  // the settings: the trail's steps, the target height (m) of a splash thrown straight up, Debug mode's No splashes (works only with Debug mode on)
  trail: number;
  targetHeight: number;
  noSplashes: boolean;
  debug: boolean;
  // one fell back (a stamp each step of the clock): its place on the water and its weight
  onLand: (x: number, z: number, weight: number) => void;

  constructor(seed: number, clock: StepClock, onLand: (x: number, z: number, weight: number) => void) {
    this.seed = seed;
    this.clock = clock;
    this.onLand = onLand;
    this.debug = false;
    this.noSplashes = false;
    this.trail = TRAIL;
    this.targetHeight = TARGET_HEIGHT;
    this.count = 0;
    this.x0 = new Float64Array(MOST);
    this.z0 = new Float64Array(MOST);
    this.t0 = new Float64Array(MOST);
    this.vx = new Float64Array(MOST);
    this.vy = new Float64Array(MOST);
    this.vz = new Float64Array(MOST);
    this.size = new Float64Array(MOST);
    this.land = new Float64Array(MOST);
    this.serial = new Float64Array(MOST);
    this.landed = new Uint8Array(MOST);
    this.seeds = new Uint32Array(MOST);
    this.rng = new Mulberry(seed);
    this.ring = new Uint32Array(RING * SPLASH_TEXELS * 4);
    this.ringFloats = new Float32Array(this.ring.buffer);
    this.nextSerial = 0;
    this.stamps = new Float64Array(3);
    this.lastStep = 0;
    this.from = 0;
  }

  // a clean start: no splashes, the generator from its seed, no steps moved on to (the slots written before stay in the ring, out of the span: nextSerial goes on)
  reset() {
    this.count = 0;
    this.rng.a = this.seed >>> 0;
    this.lastStep = 0;
    this.from = 0;
  }

  // a drop landed (at its place, at a time, in its colour): 2 to 5 splashes of its size
  fromLanding(drop: SplashLanding, time: number, size: number) {
    if (this.debug && this.noSplashes) {
      return;
    }
    this.spawn(drop.x, drop.z, 2 + Math.floor(this.rng.next() * 4), size, time, drop.color);
  }

  // splash `from` copied to place `to`
  move(from: number, to: number) {
    for (const field of FIELDS) {
      this[field][to] = this[field][from];
    }
    this.landed[to] = this.landed[from];
    this.seeds[to] = this.seeds[from];
  }

  // the oldest `n` splashes let go (the others moved to the front, in their order)
  dropOldest(n: number) {
    for (const field of FIELDS) {
      this[field].copyWithin(0, n, this.count);
    }
    this.landed.copyWithin(0, n, this.count);
    this.seeds.copyWithin(0, n, this.count);
    this.count -= n;
  }

  // count splashes from a place of the water (x, z), at a time, in a colour (white if none) (the oldest let go when there is no room, in the arrays or in the ring's span)
  spawn(x: number, z: number, count: number, size: number, time: number, color: Float32Array = WHITE) {
    count = Math.min(count, MOST);
    if (this.count + count > MOST) {
      this.dropOldest(this.count + count - MOST);
    }
    let over = 0;
    while (over < this.count && this.serial[over] < this.nextSerial + count - RING) {
      over++;
    }
    if (over > 0) {
      this.dropOldest(over);
    }
    const rng = this.rng;
    for (let k = 0; k < count; k++) {
      const speed = SplashLaunch.speedFor(this.targetHeight, SplashLaunch.energyFactorOf(rng.next()));
      const tilt = (Math.PI / 3) * Math.sqrt(rng.next());
      const round = 2 * Math.PI * rng.next();
      const v = SplashLaunch.velocity(speed, round, Math.PI / 2 - tilt);
      const vy = v.y;
      const i = this.count++;
      this.x0[i] = x;
      this.z0[i] = z;
      this.t0[i] = time;
      this.vx[i] = v.x;
      this.vy[i] = vy;
      this.vz[i] = v.z;
      this.size[i] = size * (0.3 + 0.4 * rng.next());
      this.land[i] = time + (2 * vy) / GRAVITY;
      this.landed[i] = 0;
      this.seeds[i] = Math.floor(rng.next() * 4294967296);
      this.serial[i] = this.nextSerial++;
      this.record(i, color);
    }
  }

  // splash i's values into its slot of the ring (sent to the GPU by the effect)
  record(i: number, color: ArrayLike<number>) {
    const st = SplashSim.stampsOf(this.clock, this.t0[i], this.land[i], this.stamps);
    const o = (this.serial[i] % RING) * SPLASH_TEXELS * 4;
    const f = this.ringFloats;
    const u = this.ring;
    f[o] = this.x0[i];
    f[o + 1] = this.z0[i];
    f[o + 2] = this.size[i];
    f[o + 3] = st[2];
    f[o + 4] = this.vx[i];
    f[o + 5] = this.vy[i];
    f[o + 6] = this.vz[i];
    f[o + 7] = this.clock.rate;
    f[o + 8] = color[0];
    f[o + 9] = color[1];
    f[o + 10] = color[2];
    f[o + 11] = 0;
    u[o + 12] = st[0];
    u[o + 13] = st[1];
    u[o + 14] = this.seeds[i];
    u[o + 15] = 0;
  }

  // the splashes falling back on the water by a time (each an impact through onLand), and the ones whose stamps are all gone let go (the others kept in their order)
  fall(time: number) {
    let kept = 0;
    for (let i = 0; i < this.count; i++) {
      if (!this.landed[i] && time >= this.land[i]) {
        this.landed[i] = 1;
        const t = this.land[i] - this.t0[i];
        this.onLand(this.x0[i] + this.vx[i] * t, this.z0[i] + this.vz[i] * t, IMPACT);
      }
      if (!this.landed[i] || this.clock.at(time) < this.clock.at(this.land[i]) + this.trail) {
        if (kept !== i) {
          this.move(i, kept);
        }
        kept++;
      }
    }
    this.count = kept;
  }

  // the rain's steps since the last time (the stamps are the GPU's: only the step kept), then the splashes fallen back; after a jump past what a frame can move (or back), no
  // stamps from before it
  advance(time: number) {
    const step = this.clock.stepAt(time);
    if (step - this.lastStep > this.clock.most || step < this.lastStep) {
      this.lastStep = step;
      this.from = step;
    }
    this.lastStep = Math.max(this.lastStep, step);
    this.fall(time);
  }

  // everything the next call depends on, as plain data (the live splashes' values up to count, the whole ring, the counters, the generator's state)
  snapshot(): SplashSimSnapshot {
    const n = this.count;
    return {
      count: n,
      nextSerial: this.nextSerial,
      lastStep: this.lastStep,
      from: this.from,
      rng: this.rng.a,
      x0: this.x0.slice(0, n),
      z0: this.z0.slice(0, n),
      t0: this.t0.slice(0, n),
      vx: this.vx.slice(0, n),
      vy: this.vy.slice(0, n),
      vz: this.vz.slice(0, n),
      size: this.size.slice(0, n),
      land: this.land.slice(0, n),
      serial: this.serial.slice(0, n),
      landed: this.landed.slice(0, n),
      seeds: this.seeds.slice(0, n),
      ring: this.ring.slice()
    };
  }

  restore(s: SplashSimSnapshot) {
    const n = s.count;
    this.count = n;
    this.nextSerial = s.nextSerial;
    this.lastStep = s.lastStep;
    this.from = s.from;
    this.rng.a = s.rng >>> 0;
    this.x0.set(s.x0);
    this.z0.set(s.z0);
    this.t0.set(s.t0);
    this.vx.set(s.vx);
    this.vy.set(s.vy);
    this.vz.set(s.vz);
    this.size.set(s.size);
    this.land.set(s.land);
    this.serial.set(s.serial);
    this.landed.set(s.landed);
    this.seeds.set(s.seeds);
    this.ring.set(s.ring);
  }
}

M.SplashSim = SplashSim;
