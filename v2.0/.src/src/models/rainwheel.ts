// RainWheel: the rain's landings wheel and the state it keeps, as a pure model (no GL, no page: importable in any thread), run by the rain (effects/rain.ts, which keeps the GL side
// and the scene worker's layout protocol) and, inside models/rainsimtick.ts (RainSimTick, the stepped model of the splashes' and the rain's worker: platform/steppedtask.ts's StepModel), by a
// worker, which calls runStep, the recorded calls and snapshot/restore. The wheel's own run, advanceTo, step and event are NOT what the worker calls: they are the wheel as a stepped model on
// its own, kept as the surface the tests (units.ui.rainwheel.ts and the debug API) drive it by.
// - Its landings: each drop's next landing step worked out exactly, kept in a wheel of steps (a ring of slots, each a list of drops linked through a typed array: no allocation), so a
//   step costs only its landings (runStep). A drop that lands with a fall that shows is reported through `onLand(drop, time)` (the drop's description by dropAt, valid during the call
//   only, its colour in it); the next drop's fall is gated by the music's shares, and the drop scheduled again.
// - Its drops: the arrays of the layout (distance, speed, phase and rows, 4 a drop), the lives (4 a drop: the first fall shown, the fall it ends before, a fall it shows again from; the
//   dirty range of the drops changed since the effect's last upload), the drops wanted (targets), how many are falling (active) and drawn (reach: those ending still fade there).
// - The water's height at the landings: a drop is never moved to meet the water, it is given more or fewer steps. The effect hands the wheel, as an ordered input (setMeets), a table of
//   the surface's height in rows over the floor at each drop's landing place (the gather pass's picture read back: 4 bytes a drop, see models/wavelift.ts); with a table the wheel looks at
//   a drop's landing from a lead before its nominal step (meetLead) and lands it when its head reaches the surface's row: step by step the first step whose rows fallen reach
//   (fall + 1) rows - 1 - m (m the table's rows for that fall, capped at WaveLift.CAP_ROWS), a crest sooner, a trough later (the head below the floor: its landing reported in the fall
//   that was falling, its place and head that fall's). Without a table (the water calm, Ripples off) every landing is at its nominal step, exactly as before.
// - Its colour (Custom colors 1 to 4, or the rainbow; still, or as a wave): colorOf, the wave's phase at a step (setWave, phaseAt, fallPhase, stepsSince).
// - React to music: the columns' shares of the falls (gate decides each fall as it begins), the scan that begins falls by column (spawnByMusic, wake, despawn), the credit and the times
//   of the scans, the drops whose phase was changed (woken).
// - Its inputs are plain fields set by the effect: the view (eye, pitch, field of view, yaw: `view`, set by the effect each frame), the window and the settings (width, height, density,
//   fontMin, fontMax, trail, steady, the colours and the wave), the step clock, whether a layout is pending (layoutPending: the scan waits for it), and the layout and the floor kind,
//   eye and pitch it was made for.
// - run() simulates the next step ((lastStep, lastStep + 1]) and gives the number of landings reported; advanceTo(step) every step up to `step`; snapshot()/restore() the whole state
//   (plain data, the typed arrays copied), event(payload) a live input (the view, the shares, the music's light, whether a layout is pending) applied before the next step.
//
// Changelog:
// 2026-11-12: `pending` (the fall each drop in the wheel is waiting to land): runStep, rescheduleAll and the watch use it, never the layout's guess of the fall, so a table coming or going or a restart adopted never lands a fall twice or loses one.
// 2026-11-12: adopt looks the landings at early again while a table is in force.
// 2026-11-12: the water's heights (setMeets, meetOf, the watch window meetLead, rescheduleAll, slotOf): a landing ends where the head meets the surface, a crest earlier, a trough later.
// 2026-11-10: new (the wheel and its state moved out of effects/rain.ts, behaviour unchanged).
// 2026-11-10: installLayout (the layout's fields set together); `trace` (what a stepped tick changed that its packet carries: the phases the music's wakes changed, the drops woken, the
// layout copied).
// 2026-11-12: musicFillPart is 1 (the music's falls start from the same spawn box top as the normal rain's).
// 2026-11-12: the spawn box (models/spawnbox.ts): x over the box's width at the drop's distance (was distance x SPAN), targets' pool by the box's density factor, the fall's rows of musicFillPart and averageFall from the box's top (was the world's ceiling); its scalars (boxPitch ...) in the snapshot.
// 2026-11-11: meanFallSeconds' cache also keyed on the clock's rate (meanFallRate); restore skips a scalar the snapshot lacks.
import { M } from "../engine/core";
import type { StepClock } from "../engine/clock";
import type { RestartResult } from "./rainlayout";
import type { FloorKind } from "./floor";
import type { SpawnBoxData } from "./spawnbox";
import { WaveLift } from "./wavelift";

// a drop at a step (RainWheel.dropAt): its head (rows from the top of its fall), rows, fall, whether it lands in this step and whether its fall shows, its place (x, z), its head's
// height, its colour
export interface DropState {
  head: number;
  rows: number;
  cycle: number;
  landed: boolean;
  shown: boolean;
  x: number;
  z: number;
  headY: number;
  color: Float32Array;
}

// the camera's values the wheel reads, set by the effect (before any call that reads them)
export interface RainView {
  eyeX: number;
  eyeY: number;
  tilt: number;
  halfFov: number;
  yaw: number;
}

// the whole state of a wheel (RainWheel.snapshot): plain data, the arrays copies
export interface RainWheelSnapshot {
  numbers: Record<string, number | boolean | string>;
  view: RainView;
  clock: { from: number; base: number; rate: number };
  layout: Float32Array | null;
  life: Uint32Array;
  slots: Int32Array;
  nextInSlot: Int32Array;
  inWheel: Uint8Array;
  woken: Uint8Array;
  shares: Float32Array | null;
  musicLight: Float32Array | null;
  colors: Float32Array[];
  // whether the mean fall's layout (meanFallFor) is the layout
  meanFallForLayout: boolean;
  // the water's heights table (the first meetCount drops' bytes; null: none)
  meets?: Uint8Array | null;
  // the fall each drop in the wheel is waiting to land
  pending?: Uint32Array;
}

// what a stepped run changes that is not in the lives (RainWheel.trace, kept by wake, adopt and the music's refresh of the layout): the phases changed (drop, phase pairs), the drops
// newly woken since the last reset of the woken flags, whether those flags were reset, and whether the layout was copied
export interface WheelTrace {
  phases: number[];
  woke: number[];
  wokenReset: boolean;
  refreshed: boolean;
}

// a live input applied between steps (RainWheel.event): any of these
export interface RainWheelEvent {
  view?: RainView;
  shares?: Float32Array | null;
  musicLight?: Float32Array | null;
  layoutPending?: boolean;
}

const RL = M.RainLayout;
// the pool (the most drops that can fall, whatever the settings and the window)
const COUNT = RL.COUNT;
const CELL = RL.CELL;
const SEED = RL.SEED;
// the most rows a landing is moved by the water's height, the table's bias, and its bytes a drop (models/wavelift.ts)
const MEET_CAP = WaveLift.CAP_ROWS;
const MEET_BIAS = WaveLift.BIAS;
const MEET_STRIDE = WaveLift.STRIDE;
// a fall shorter than this many rows is never moved (the head's row classes the landing waiting, see runStep: its landing must lie past half the fall's rows)
const MEET_MIN_ROWS = 32;
// no fall (a life's bound)
const NONE = RL.NONE;
// a font size's distance: DISTANCE_SIZE / size (m)
const DISTANCE_SIZE = 40;
// matrix_web_rain's drops for a density (its RainScale)
const RAIN_SCALE = 1.06;
// React to music: the seconds between scans of the drops, the most falls begun in a scan, the cycles tried for a column, and the seconds between the workers' layouts
const MUSIC_SCAN = 0.25;
const MUSIC_MOST = 4000;
const MUSIC_CYCLES = 48;
const MUSIC_STATIC = 5;
// the colours' defaults (project.json's Color 1 to 4, as linear light)
const DEFAULT_COLORS = [
  "0.62745098 0.37254902 1",
  "0.57254902 1 0.69019608",
  "0.4745098 0.94117647 1",
  "0.62745098 0.37254902 1",
];
// the width of a 16:9 view as a bearing (x / z): the colours' unit across the world (worked out at the first use: M.Camera is loaded by then)
let WAVE_SCREEN = 0;
const waveScreen = (): number => {
  if (WAVE_SCREEN === 0) {
    WAVE_SCREEN = 2 * (16 / 9) * Math.tan(M.Camera.halfFov());
  }
  return WAVE_SCREEN;
};

// the scalar state a snapshot keeps (every number, flag and string a next step depends on)
const SCALARS = [
  "time", "lastStep", "width", "height", "density", "fontMin", "fontMax", "trail", "steady", "custom", "wave", "waveSpeed", "waveWidth", "wavePhase", "waveStep", "wavePerStep",
  "tiltResponsiveness", "layoutFloor", "layoutPitch", "layoutEye", "layoutDirty", "layoutPending", "dirtyFirst", "dirtyLast", "active", "reach", "wanted", "inView", "wokenCount", "fillPart",
  "fillFor", "musicCredit", "meanFall", "musicAt", "staticAt", "wrongLandings", "appliedSeq", "boxPitch", "boxEyeHeight", "boxYaw", "boxPitchReach", "boxReachX", "boxReachY", "meetCount",
] as const;

export class RainWheel {
  static COUNT = COUNT;
  static DISTANCE_SIZE = DISTANCE_SIZE;
  static RAIN_SCALE = RAIN_SCALE;
  static waveScreen = waveScreen;
  onLand: (drop: DropState, time: number) => void;
  clock: StepClock;
  view: RainView;
  // the last time moved on to (a Speed set then goes on from its step)
  time: number;
  lastStep: number;
  // the window and the settings
  width: number;
  height: number;
  density: number;
  fontMin: number;
  fontMax: number;
  // the trail's cells drawn (the layout's)
  trail: number;
  // Steady start (a reset, or a jump in time, settles all of them at once)
  steady: boolean;
  // Custom colors 1 to 4 (else the rainbow), the wave (its speed and width in widths of a 16:9 view: a second, a cycle) and its phase at a step (phase at waveStep, and per step)
  colors: Float32Array[];
  custom: boolean;
  wave: boolean;
  waveSpeed: number;
  waveWidth: number;
  wavePhase: number;
  waveStep: number;
  wavePerStep: number;
  // Music rain responsiveness (the rate of the falls the music asks for)
  tiltResponsiveness: number;
  // the spawn box's inputs (models/spawnbox.ts), set by the effect: the base tilt and the eye's height (not the parallax's live offsets), and the range the mouse parallax reaches (yaw and
  // pitch in radians, the eye's x and y in metres); the window's aspect, the field of view and the nearest and furthest distances the box is made from are the wheel's own
  boxPitch: number;
  boxEyeHeight: number;
  boxYaw: number;
  boxPitchReach: number;
  boxReachX: number;
  boxReachY: number;
  // the box made from them (box()), what it was made from, and its density factor
  boxData: SpawnBoxData | null;
  boxKey: number[];
  boxFactor: number;
  // the layout, and what it was made for: the floor, the pitch and the eye's height (the layout's upload owed: layoutDirty)
  layout: Float32Array | null;
  layoutFloor: FloorKind;
  layoutPitch: number;
  layoutEye: number;
  layoutDirty: boolean;
  // a layout from the worker is waited for (the music's scan waits)
  layoutPending: boolean;
  // each drop's life, and the drops whose life changed since the last upload
  life: Uint32Array;
  dirtyFirst: number;
  dirtyLast: number;
  // the drops counted as falling (the first `active` of the pool), the ones drawn (the first `reach`), the drops wanted, and the ones wanted in view
  active: number;
  reach: number;
  wanted: number;
  inView: number;
  // the wheel: each slot's first drop (-1: none), each drop's next in its slot, whether it is in the wheel
  slots: Int32Array;
  nextInSlot: Int32Array;
  inWheel: Uint8Array;
  // React to music: each column's share of the settled rain's falls (the columns across the window, from the left; null: the settled rain)
  shares: Float32Array | null;
  // the drops' light emittance across the window (128 bins; null: none)
  musicLight: Float32Array | null;
  // the water's heights (setMeets): the table's bytes (4 a drop) and the drops it covers (0: none, every landing at its nominal step), and the slot each drop in the wheel is in
  meets: Uint8Array;
  meetCount: number;
  slotOf: Int32Array;
  // the fall each drop in the wheel is waiting to land (its landing is scheduled, or looked at each step): the fall a landing then reports, and the next one's after it
  pending: Uint32Array;
  // the drops whose phase was changed to begin a fall now, and how many
  woken: Uint8Array;
  wokenCount: number;
  // the part of its drops the normal rain has in the view at a time (the rest are above it, waiting), and what it was worked out for
  fillPart: number;
  fillFor: string;
  // the falls the music may begin: the credit (falls), the time of the last scan and of the last refresh of the workers' layout (s)
  musicCredit: number;
  musicAt: number;
  staticAt: number;
  meanFall: number;
  meanFallFor: Float32Array | null;
  // the clock's rate meanFall was worked out at (the cache is valid for a layout and a rate)
  meanFallRate: number;
  // (the scan's scratch arrays)
  musicShown: Int32Array;
  musicDeficit: Float32Array;
  musicFree: Int32Array;
  musicShowing: Int32Array;
  musicOut: Int32Array;
  // (the drop and the landing as dropAt describes them, reused)
  at: Partial<DropState>;
  landing: Partial<DropState>;
  // (the tests': landings taken from the wheel that were none, with M.TEST)
  wrongLandings: number;
  // what a stepped run changes outside the lives, for its packet (null: not kept)
  trace: WheelTrace | null;
  // the last call kept for a task (RainCall.q) that this wheel has had run on it: the render thread's wheel runs each call itself as it is made, so a local tick, restored from an
  // older checkpoint and replayed, runs only the calls after that
  appliedSeq: number;

  constructor(clock: StepClock, onLand: (drop: DropState, time: number) => void) {
    this.clock = clock;
    this.onLand = onLand;
    this.view = { eyeX: 0, eyeY: 0, tilt: 0, halfFov: M.Camera.halfFov(), yaw: 0 };
    this.time = 0;
    this.lastStep = 0;
    this.width = 800;
    this.height = 600;
    this.density = 5;
    this.fontMin = 1;
    this.fontMax = 16;
    this.trail = 18;
    this.steady = false;
    this.colors = DEFAULT_COLORS.map((c) => M.color(c));
    this.custom = true;
    this.wave = true;
    this.waveSpeed = 0.1;
    this.waveWidth = 1.5;
    this.wavePhase = 0;
    this.waveStep = 0;
    this.wavePerStep = 0;
    this.tiltResponsiveness = 2;
    this.boxPitch = 0;
    this.boxEyeHeight = M.Camera.EYE;
    this.boxYaw = 0;
    this.boxPitchReach = 0;
    this.boxReachX = 0;
    this.boxReachY = 0;
    this.boxData = null;
    this.boxKey = [];
    this.boxFactor = 1;
    this.layout = null;
    this.layoutFloor = "water";
    this.layoutPitch = 0;
    this.layoutEye = 0;
    this.layoutDirty = false;
    this.layoutPending = false;
    // each drop's life (its first fall shown, the fall it ends before, a fall it shows again from; NONE: none), and the drops whose layout or life changed since the last upload
    this.life = new Uint32Array(COUNT * 4);
    this.dirtyFirst = COUNT;
    this.dirtyLast = -1;
    this.active = 0;
    this.reach = 0;
    this.wanted = 0;
    this.inView = 0;
    this.slots = new Int32Array(1);
    this.nextInSlot = new Int32Array(COUNT);
    this.inWheel = new Uint8Array(COUNT);
    this.shares = null;
    this.musicLight = null;
    this.meets = new Uint8Array(COUNT * MEET_STRIDE);
    this.meetCount = 0;
    this.slotOf = new Int32Array(COUNT);
    this.pending = new Uint32Array(COUNT);
    this.woken = new Uint8Array(COUNT);
    this.wokenCount = 0;
    this.fillPart = 1;
    this.fillFor = "";
    this.musicCredit = 0;
    this.meanFall = 1;
    this.meanFallFor = null;
    this.meanFallRate = NaN;
    this.musicShown = new Int32Array(0);
    this.musicDeficit = new Float32Array(0);
    this.musicFree = new Int32Array(COUNT);
    this.musicShowing = new Int32Array(COUNT);
    this.musicOut = new Int32Array(COUNT);
    this.musicAt = -Infinity;
    this.staticAt = 0;
    this.landing = {};
    this.at = {};
    this.wrongLandings = 0;
    this.trace = null;
    this.appliedSeq = 0;
  }

  // ---- the drops' places ----

  // the spawn box (models/spawnbox.ts) of the window, the field of view, the distances and the box's scalars: made again only when one of them changed
  box(): SpawnBoxData {
    const key = this.boxKey;
    const aspect = this.width / this.height;
    const near = this.nearest();
    const far = this.furthest();
    const halfFov = M.Camera.halfFov();
    const same =
      this.boxData !== null && key.length === 10 && key[0] === aspect && key[1] === halfFov && key[2] === this.boxPitch && key[3] === this.boxEyeHeight && key[4] === this.boxYaw &&
      key[5] === this.boxPitchReach && key[6] === this.boxReachX && key[7] === this.boxReachY && key[8] === near && key[9] === far;
    if (!same || !this.boxData) {
      this.boxData = M.SpawnBox.make({ aspect, halfFov, pitch: this.boxPitch, eyeHeight: this.boxEyeHeight, yaw: this.boxYaw, pitchReach: this.boxPitchReach, eyeX: this.boxReachX, eyeY: this.boxReachY, near, far }, this.boxData || undefined);
      this.boxFactor = M.SpawnBox.densityFactor(this.boxData);
      key.length = 0;
      key.push(aspect, halfFov, this.boxPitch, this.boxEyeHeight, this.boxYaw, this.boxPitchReach, this.boxReachX, this.boxReachY, near, far);
    }
    return this.boxData;
  }

  // the nearest and the furthest distance (Font size Max and Min, Min at most Max)
  nearest() {
    return DISTANCE_SIZE / this.fontMax;
  }

  furthest() {
    return DISTANCE_SIZE / Math.min(this.fontMin, this.fontMax);
  }

  // a layout in place: the trail, the floor, the pitch and the eye's height it was made for (the upload owed), and a new wheel's slots when their number is given
  installLayout(layout: Float32Array, trail: number, floor: FloorKind, pitch: number, eye: number, slots: number | null) {
    this.trail = trail;
    this.layout = layout;
    this.layoutFloor = floor;
    this.layoutPitch = pitch;
    this.layoutEye = eye;
    this.layoutDirty = true;
    if (this.trace) {
      // (the phases changed in the layout before are gone with it)
      this.trace.phases.length = 0;
    }
    if (slots !== null) {
      this.slots = new Int32Array(slots);
    }
  }

  // the first drop's life: a restart's lives and wheel taken (all the lives to upload)
  adopt(r: RestartResult) {
    this.life = r.life;
    this.slots = r.slots;
    this.nextInSlot = r.nextInSlot;
    this.inWheel = r.inWheel;
    this.rebuildSlotOf();
    this.resetPending();
    this.packMeets(0);
    // (a restart schedules each landing at its nominal step: with a table in force they are looked at early again)
    if (this.meetCount > 0) {
      this.rescheduleAll();
    }
    this.active = r.active;
    this.reach = r.reach;
    this.dirtyFirst = 0;
    this.dirtyLast = COUNT - 1;
    // (a new layout: the phases changed for the music are gone with the old one; the music's shares decide the first falls too)
    this.woken.fill(0);
    this.wokenCount = 0;
    if (this.trace) {
      this.trace.woke.length = 0;
      this.trace.wokenReset = true;
    }
    this.gateFirst(0, this.active, this.steady);
  }

  // the first fall of drops from..to-1 that has not come into the view yet (a clean start: none has) is shown or not by the music's shares, as every later one is (nothing
  // falls at the start in silence); a fall in the view is left to finish, unless the rain was settled at once (`now`: a jump in time, Steady start: the falls in progress are
  // shown or not by the shares too)
  gateFirst(from: number, to: number, now = false) {
    if (!this.shares) {
      return;
    }
    for (let i = from; i < to; i++) {
      const first = this.life[i * 4];
      if (first === NONE) {
        continue;
      }
      const d = this.dropAt(i, this.lastStep, this.at);
      if (now) {
        // (and the next fall: a drop landing in this very step has no landing left to decide it)
        this.gate(i, d.cycle);
        this.gate(i, d.cycle + 1);
      } else if (first > d.cycle || (first === d.cycle && d.headY > this.topAt(-d.z))) {
        this.gate(i, first);
      }
    }
  }

  // ---- the colours ----

  // the wave: on or off, its speed and width; its phase going on from where it is (a step of the rain's), at the steps' rate now
  setWave(on: boolean, speed: number, width: number) {
    const step = this.clock.stepAt(this.time);
    this.wavePhase = this.phaseAt(step);
    this.waveStep = step;
    this.wave = on;
    this.waveSpeed = speed;
    this.waveWidth = width;
    this.wavePerStep = on ? speed / width / this.clock.rate : 0;
  }

  // the steps' rate changed (Speed): the wave goes on from where it is at the new rate
  rateChanged() {
    this.setWave(this.wave, this.waveSpeed, this.waveWidth);
  }

  phaseAt(step: number) {
    return this.wavePhase + (step - this.waveStep) * this.wavePerStep;
  }

  // the steps since drop i's fall began, at a step, from the rows it has fallen in it: exactly step - ceil(16 (rows to the fall's start) / speed), in small numbers only (with
  // step = 16 q + r, the q's cancel): r - ceil((16 floor(r speed / 16) - 16 rowsSince) / speed), as the shader
  stepsSince(i: number, step: number, rowsSince: number) {
    const speed = this.layout![i * 4 + 1];
    const r = step % 16;
    return r - Math.ceil((16 * Math.floor((r * speed) / 16) - 16 * rowsSince) / speed);
  }

  // the wave's phase when a fall began, at a step: the phase now (its fraction, as the shader gets it) less the steps since
  fallPhase(i: number, step: number, rowsSince: number) {
    const now = this.phaseAt(step);
    return now - Math.floor(now) - this.stepsSince(i, step, rowsSince) * this.wavePerStep;
  }

  // drop i's colour in its fall at a step (d: dropAt's description of it then), into a colour given
  colorOf<T extends Float32Array | number[]>(i: number, d: Pick<DropState, "x" | "z" | "head">, step: number, into: T) {
    const distance = -d.z;
    const position = d.x / distance / waveScreen() + 0.5;
    const wave = (((position / this.waveWidth - this.fallPhase(i, step, d.head)) % 1) + 1) % 1;
    if (this.custom) {
      const c = this.colors;
      const at = this.wave ? wave : Math.min(1, Math.max(0, position));
      const n = this.wave ? 5 : 4;
      const segments = 2 * (n - 1);
      const segment = Math.min(Math.floor(at * segments), segments - 1);
      const amount = at * segments - segment;
      const a = c[Math.floor(segment / 2) % 4];
      const b = c[(Math.floor(segment / 2) + 1) % 4];
      for (let k = 0; k < 3; k++) {
        into[k] = Math.min(1, Math.max(0, segment % 2 === 0 ? a[k] + b[k] * amount : b[k] + a[k] * (1 - amount)));
      }
    } else {
      const hue = (((this.wave ? wave : position) * 360 + 347) % 360 + 360) % 360;
      const offsets = [0, 4, 2];
      for (let k = 0; k < 3; k++) {
        const v = (hue / 60 + offsets[k]) % 6;
        into[k] = M.linear(Math.min(1, Math.max(0, Math.abs(v - 3) - 1)));
      }
    }
    return into;
  }

  // ---- how many ----

  // the drops wanted in view (matrix_web_rain's rainCount x RAIN_SCALE) and in the pool: the drops in view times the box's density factor (models/spawnbox.ts: the box's width and fall are
  // the view's plus the parallax's reach, so the drops per pixel in the view are what they were over the world's width)
  targets() {
    const min = Math.min(this.fontMin, this.fontMax);
    const max = this.fontMax;
    const perPixel = max > min ? (1 / min - 1 / max) / Math.log(max / min) : 1 / max;
    const inView = RAIN_SCALE * Math.max(1, Math.round(this.density * this.width * perPixel));
    this.box();
    return [inView, Math.min(COUNT, Math.round(inView * this.boxFactor))];
  }

  // the columns' shares of the falls (null: the settled rain's): each fall is shown or not by its column's share, decided as it begins (gate), so a fall in progress is
  // never cut short and the drops come round to the music as their falls end
  setShares(shares: Float32Array | null) {
    const first = !this.shares && !!shares;
    this.shares = shares;
    if (first) {
      // (the music takes the rain over: the falls not in the view yet are gated; with Steady start, whose falls are all in progress, all of them)
      this.gateFirst(0, this.active, this.steady);
    }
  }

  // the drops' light emittance across the window (the multiple of their light by bin, left to right; null: none)
  setMusicLight(light: Float32Array | null) {
    this.musicLight = light;
  }

  // the column across the window of a place (x, distance): the world's space seen from the front, in the window's width
  columnOf(x: number, distance: number, columns: number) {
    // (the place's bearing from the eye, less the view's turn: with the parallax's yaw and eye offset the columns follow the view)
    const view = this.view;
    const bearing = (x - view.eyeX) / distance - (view.yaw === 0 ? 0 : Math.tan(view.yaw));
    const position = bearing / (2 * (this.width / this.height) * Math.tan(M.Camera.halfFov())) + 0.5;
    return Math.min(columns - 1, Math.max(0, Math.floor(position * columns)));
  }

  // ---- React to music: the falls begun and ended by column ----

  // the falling drops by column (the columns across the window, from the left): how many of the drops wanted show their fall now, in each (into a given array)
  showingColumns(columns: number, into?: Int32Array) {
    const out = into && into.length >= columns ? into : new Int32Array(columns);
    out.fill(0, 0, columns);
    if (!this.layout) {
      return out;
    }
    for (let i = 0; i < this.active; i++) {
      const cycle = this.cycleAt(i, this.lastStep);
      if (this.life[i * 4] !== NONE && this.shows(i, cycle)) {
        out[this.columnOf(this.x(i, cycle, this.layout[i * 4]), this.layout[i * 4], columns)]++;
      }
    }
    return out;
  }

  // the part of the drops wanted the music keeps falling, for as many in the view as the normal rain has at a time: 1. The music's falls and the normal rain's have the same rows (both
  // start from the spawn box's top: the layout's plane does not follow the view's instantaneous offsets), and a drop the music wakes begins its fall at the top of it, so the music's
  // drops are in the view as long as the normal rain's are, and its shares need no scaling
  musicFillPart() {
    return 1;
  }

  // the average time a drop takes to fall (s), over every 16th of the drops wanted: its rows over its speed in steps (a speed of s sixteenths of a row a step), at the step rate
  meanFallSeconds() {
    const data = this.layout;
    if (!data) {
      return 1;
    }
    if (this.meanFallFor !== data || this.meanFallRate !== this.clock.rate) {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < COUNT; i += 16) {
        sum += (data[i * 4 + 3]! * 16) / data[i * 4 + 1]!;
        n++;
      }
      const steps = sum / Math.max(1, n);
      this.meanFall = Math.max(0.1, this.clock.timeOf(this.lastStep + Math.ceil(steps)) - this.clock.timeOf(this.lastStep));
      this.meanFallFor = data;
      this.meanFallRate = this.clock.rate;
    }
    return this.meanFall;
  }

  // the falls the music asks for a second in all (the drops coming round by themselves begin the first part of them, the scan the rest): the settled rain's rate (every drop begins a fall once in the time of a fall) for the density the music sets at this moment (the
  // drops wanted times the mean share of the columns), as matrix_web_rain's drops come in at the new rain's settled rate and not all at once, times Music rain responsiveness's
  // factor (1: that rate exactly; each step halves the time given to reach the steady state: 2 ^ (responsiveness - 1))
  musicRate() {
    const shares = this.shares;
    if (!shares || shares.length === 0) {
      return 0;
    }
    let sum = 0;
    for (let c = 0; c < shares.length; c++) {
      sum += shares[c]!;
    }
    return (this.active * this.musicFillPart() * (sum / shares.length) * M.MusicRain.rateFactor(this.tiltResponsiveness)) / this.meanFallSeconds();
  }

  // a scan of the drops (about 4 a second while the music drives) against the columns' shares: a column with fewer falling drops than its share of the drops wanted gets
  // new falls at once, begun at the top of their fall now by drops that are not falling (their phase changed to start a fall now, in a cycle whose place across is in the
  // column: the drop's falls are at places by a hash of the drop and the fall); when no drop is free for them, falls are ended (despawned) in the columns with more
  // falling drops than their share, the farthest first and, among those, the oldest (the furthest down its fall)
  spawnByMusic(time: number) {
    const shares = this.shares;
    if (!shares || !this.layout || this.layoutPending || this.active === 0 || time - this.musicAt < MUSIC_SCAN) {
      return;
    }
    // (the falls begun by it are no more than the settled rain's rate allows: the credit of the time since the last scan, carried over)
    const since = this.musicAt === -Infinity ? 0 : Math.min(1, Math.max(0, time - this.musicAt));
    // (the drops coming round by themselves, each fall accepted by its column's share as the one before lands, already begin falls at the steady rate (1 times the rate of the density
    // the music sets, the normal rain's steady rate for it): the falls begun here are the rest of the rate Music rain responsiveness asks for, (factor - 1) times that)
    const factor = M.MusicRain.rateFactor(this.tiltResponsiveness);
    this.musicCredit = Math.min(this.musicCredit + this.musicRate() * (1 - 1 / factor) * since, MUSIC_MOST);
    this.musicAt = time;
    if (this.musicCredit < 1) {
      return;
    }
    const step = this.lastStep;
    const columns = shares.length;
    const active = this.active;
    const data = this.layout;
    const shown = this.musicShown.length >= columns ? this.musicShown : (this.musicShown = new Int32Array(columns));
    const deficit = this.musicDeficit.length >= columns ? this.musicDeficit : (this.musicDeficit = new Float32Array(columns));
    shown.fill(0, 0, columns);
    const free = this.musicFree;
    const showing = this.musicShowing;
    let freeCount = 0;
    let showingCount = 0;
    for (let i = 0; i < active; i++) {
      if (this.life[i * 4] === NONE) {
        continue;
      }
      const cycle = this.cycleAt(i, step);
      if (this.shows(i, cycle)) {
        shown[this.columnOf(this.x(i, cycle, data[i * 4]), data[i * 4], columns)]++;
        showing[showingCount++] = i;
      } else {
        free[freeCount++] = i;
      }
    }
    let owed = 0;
    let total = 0;
    let wanted = 0;
    const per = active / columns;
    const fill = this.musicFillPart();
    for (let c = 0; c < columns; c++) {
      deficit[c] = Math.floor(shares[c]! * fill * per - shown[c]!);
      if (deficit[c]! > 0) {
        owed += deficit[c]!;
      }
      total += shown[c]!;
      wanted += shares[c]! * fill * per;
    }
    // (the falls begun never take the whole past what the columns' shares call for in all: each column filled up to its own share alone would leave the whole above it by the
    // columns' chance fluctuations)
    owed = Math.min(owed, Math.floor(wanted - total));
    if (owed <= 0) {
      return;
    }
    owed = Math.min(owed, Math.floor(this.musicCredit));
    // (no drop free for the falls owed: the oldest and farthest of those falling in the columns with more than their share end)
    if (freeCount < owed) {
      const out = this.musicOut;
      let n = 0;
      for (let k = 0; k < showingCount; k++) {
        const i = showing[k]!;
        const cycle = this.cycleAt(i, step);
        const c = this.columnOf(this.x(i, cycle, data[i * 4]), data[i * 4], columns);
        if (shown[c]! > shares[c]! * fill * per + 1) {
          out[n++] = i;
        }
      }
      const key = (i: number) => data[i * 4] * 1e6 + (this.total(i, step) % data[i * 4 + 3]);
      const picked = out.subarray(0, n).sort((a, b) => key(b) - key(a));
      for (let k = 0; k < picked.length && freeCount < owed; k++) {
        const i = picked[k]!;
        const cycle = this.cycleAt(i, step);
        const c = this.columnOf(this.x(i, cycle, data[i * 4]), data[i * 4], columns);
        if (shown[c]! > shares[c]! * fill * per + 1) {
          shown[c]!--;
          this.despawn(i, cycle);
          free[freeCount++] = i;
        }
      }
    }
    // (the drops free begin falls, each in a column that is owed one: the first cycle of the next MUSIC_CYCLES that is placed in one)
    const mask = this.slots.length - 1;
    let woke = 0;
    const start = freeCount > 0 ? Math.floor(time * 1000) % freeCount : 0;
    for (let k = 0; k < freeCount && woke < owed; k++) {
      const i = free[(start + k) % freeCount]!;
      const distance = data[i * 4];
      const rows = data[i * 4 + 3];
      const t = this.total(i, step);
      const base = (t - data[i * 4 + 2]) >>> 0;
      const r0 = (rows - (base % rows)) % rows;
      for (let j = 0; j < MUSIC_CYCLES; j++) {
        const phase = r0 + j * rows;
        if (base + phase >= 4294967296) {
          break;
        }
        const cycle = (base + phase) / rows;
        const c = this.columnOf(this.x(i, cycle, distance), distance, columns);
        if (deficit[c]! >= 1) {
          deficit[c]!--;
          this.wake(i, step, phase, cycle, mask);
          woke++;
          this.musicCredit--;
          break;
        }
      }
    }
    // (the workers' layout is sent again now and then, with the new phases: the drops woken are then known to them)
    if (this.wokenCount > 0 && time - this.staticAt > MUSIC_STATIC) {
      this.staticAt = time;
      this.layout = Float32Array.from(this.layout);
      this.layoutDirty = true;
      this.woken.fill(0);
      this.wokenCount = 0;
      if (this.trace) {
        this.trace.refreshed = true;
        this.trace.wokenReset = true;
        this.trace.woke.length = 0;
      }
    }
  }

  // drop i's fall now ends (its place in this fall in its column is more than the music calls for): it shows no more of it, its next falls as before
  despawn(i: number, cycle: number) {
    const life = this.life;
    this.setLife(i, life[i * 4], life[i * 4 + 1] === NONE ? cycle : Math.min(life[i * 4 + 1], cycle), cycle + 1);
  }

  // drop i begins a fall at the top now: its phase changed so that its head is at the first row in a step now (the fall `cycle` of its new phase), its landing moved, its
  // fall shown from there
  wake(i: number, step: number, phase: number, cycle: number, mask: number) {
    if (this.inWheel[i]) {
      // (out of the slot it is in: its landing's nominal one, or earlier while the water's height has it looked at, or the next step while its landing waits)
      const old = this.slotOf[i]!;
      let at = this.slots[old]!;
      if (at === i) {
        this.slots[old] = this.nextInSlot[i]!;
      } else {
        while (at >= 0 && this.nextInSlot[at] !== i) {
          at = this.nextInSlot[at]!;
        }
        if (at >= 0) {
          this.nextInSlot[at] = this.nextInSlot[i]!;
        }
      }
      this.inWheel[i] = 0;
    }
    this.layout![i * 4 + 2] = phase;
    this.layoutDirty = true;
    if (this.trace) {
      this.trace.phases.push(i, phase);
    }
    if (!this.woken[i]) {
      this.woken[i] = 1;
      this.wokenCount++;
      if (this.trace) {
        this.trace.woke.push(i);
      }
    }
    this.setLife(i, cycle, NONE, NONE);
    this.scheduleAfter(i, step);
  }

  // drop i's fall `next` begins when the fall before landed: shown or not by the share of the column it falls in (a hash of the drop and the fall under the share),
  // by its life's falls shown ([first, end) and from again)
  gate(i: number, next: number) {
    const shares = this.shares;
    if (!shares || i >= this.active) {
      return;
    }
    const distance = this.layout![i * 4];
    const share = shares[this.columnOf(this.x(i, next, distance), distance, shares.length)]! * this.musicFillPart();
    const accepted = M.hash(((Math.imul(i, 2246822519) ^ Math.imul(next, 3266489917)) + SEED) >>> 0) / 4294967296 < share;
    const shown = this.shows(i, next);
    const life = this.life;
    if (accepted) {
      if (!shown) {
        this.setLife(i, next, NONE, NONE);
      }
    } else if (shown) {
      this.setLife(i, life[i * 4], life[i * 4 + 1] === NONE ? next : life[i * 4 + 1], next + 1);
    } else if (life[i * 4 + 2] !== NONE && life[i * 4 + 2] < next + 1) {
      this.setLife(i, life[i * 4], life[i * 4 + 1], next + 1);
    }
  }

  // the screen's columns of Font size Max (the music's chance is by column)
  musicColumns() {
    return Math.max(1, Math.ceil(this.width / this.fontMax));
  }

  // the rows a drop falls on average (from the world's ceiling at its distance to the water, over the distances the drops are at, in cells)
  averageFall() {
    const near = this.nearest();
    const far = this.furthest();
    const box = this.box();
    let sum = 0;
    const n = 16;
    for (let k = 0; k < n; k++) {
      sum += M.SpawnBox.top(box, near + ((far - near) * (k + 0.5)) / n) / CELL;
    }
    return Math.max(1, sum / n);
  }

  // the drops wanted again: more come in (start), fewer finish their fall
  retarget() {
    [this.inView, this.wanted] = this.targets();
    if (!this.layout) {
      return;
    }
    const step = this.lastStep;
    for (let i = this.active; i < this.wanted; i++) {
      this.start(i, step);
    }
    for (let i = this.wanted; i < this.active; i++) {
      this.finish(i, step);
    }
    const before = this.active;
    this.active = this.wanted;
    this.reach = Math.max(this.reach, this.active);
    this.gateFirst(before, this.active);
  }

  // ---- each drop's life ----

  setLife(i: number, first: number, end: number, again: number) {
    this.life[i * 4] = first;
    this.life[i * 4 + 1] = end;
    this.life[i * 4 + 2] = again;
    this.dirty(i);
  }

  dirty(i: number) {
    this.dirtyFirst = Math.min(this.dirtyFirst, i);
    this.dirtyLast = Math.max(this.dirtyLast, i);
  }

  // does drop i show its fall f?
  shows(i: number, f: number) {
    const life = this.life;
    return (f >= life[i * 4] && f < life[i * 4 + 1]) || f >= life[i * 4 + 2];
  }

  // will it show any fall after f?
  showsAfter(i: number, f: number) {
    return f + 1 < this.life[i * 4 + 1] || this.life[i * 4 + 2] !== NONE;
  }

  // a clean screen (none falling: they come in), or with Steady start the settled rain (RainLayout.restartOf, into the arrays it has)
  restart() {
    if (!this.layout) {
      return;
    }
    [this.inView, this.wanted] = this.targets();
    const view = this.view;
    const params = {
      layout: this.layout,
      slots: this.slots.length,
      wanted: this.wanted,
      steady: this.steady,
      lastStep: this.lastStep,
      eyeHeight: view.eyeY,
      pitch: view.tilt,
      halfFov: view.halfFov,
      floor: this.layoutFloor,
    };
    this.adopt(RL.restartOf(params, this));
  }

  // the settled rain at once (after a jump in time: as if it had filled meanwhile)
  settle() {
    const steady = this.steady;
    this.steady = true;
    this.restart();
    this.steady = steady;
  }

  // the height of the top of the view at a distance (the view now, with the mouse parallax's shifts)
  topAt(distance: number) {
    const view = this.view;
    return view.eyeY + distance * Math.tan(view.tilt + view.halfFov);
  }

  // the first of drop i's falls whose head comes down past the top of the view from a step on: the fall now if its head is above the view, else the next
  firstFrom(i: number, step: number) {
    const d = this.dropAt(i, step, this.at);
    return d.headY > this.topAt(-d.z) ? d.cycle : d.cycle + 1;
  }

  // drop i comes in at a step: from the first of its falls coming down into the view (one still fading from its end goes on, or shows again from there); scheduled in the wheel
  start(i: number, step: number) {
    const first = this.firstFrom(i, step);
    if (this.life[i * 4] !== NONE && i < this.reach) {
      if (this.cycleAt(i, step) < this.life[i * 4 + 1]) {
        this.setLife(i, this.life[i * 4], NONE, NONE);
      } else {
        this.setLife(i, this.life[i * 4], this.life[i * 4 + 1], first);
      }
    } else {
      this.setLife(i, first, NONE, NONE);
    }
    if (!this.inWheel[i]) {
      this.scheduleAfter(i, step);
    }
  }

  // drop i ends: its fall now finishes (or, its head not in view yet, ends at once), its trail fading where it lands
  finish(i: number, step: number) {
    const d = this.dropAt(i, step, this.at);
    const end = d.headY > this.topAt(-d.z) ? d.cycle : d.cycle + 1;
    this.setLife(i, this.life[i * 4], Math.max(this.life[i * 4], end), NONE);
  }

  // the drops that ended and faded let go
  fade(step: number) {
    while (this.reach > this.active) {
      const j = this.reach - 1;
      if (this.life[j * 4] !== NONE) {
        const d = this.dropAt(j, step, this.at);
        const end = this.life[j * 4 + 1];
        if (this.life[j * 4 + 2] !== NONE || !(d.cycle > end || (d.cycle === end && d.head >= this.trail))) {
          break;
        }
        this.setLife(j, NONE, 0, NONE);
      }
      this.reach--;
    }
  }

  // ---- a drop's fall ----

  // the height of the floor at a distance for the layout in use
  floorAt(distance: number) {
    return this.layoutFloor === "screen" ? M.Floor.heightAt("screen", distance, this.layoutEye, this.view.halfFov, this.layoutPitch) : 0;
  }

  // how far drop i has fallen at a step, counted in rows since the start (in 32 bits, as the shader: (step / 16) x speed + (step % 16) x speed / 16, exactly step x speed / 16)
  total(i: number, step: number) {
    return RL.total(this.layout!, i, step);
  }

  cycleAt(i: number, step: number) {
    return Math.floor(this.total(i, step) / this.layout![i * 4 + 3]);
  }

  // a drop's place across in a fall: new for every fall, over the spawn box's width at its distance
  x(i: number, cycle: number, distance: number) {
    const across = M.hash(((Math.imul(i, 2654435761) ^ Math.imul(cycle, 40503)) + SEED) >>> 0) / 4294967296;
    const box = this.box();
    return (across * 2 - 1) * M.SpawnBox.widthAt(box.slope, box.shift, box.span, distance);
  }

  // its falls finished by a step (a fall finishes when its head reaches its lowest row)
  falls(i: number, step: number) {
    return RL.falls(this.layout!, i, step);
  }

  landed(i: number, step: number) {
    return RL.landed(this.layout!, i, step);
  }

  // the first step after `after` in which drop i lands
  nextLanding(i: number, after: number) {
    return RL.nextLanding(this.layout!, i, after);
  }

  // drop i placed in the wheel at a step, waiting to land its fall `fall`
  place(i: number, step: number, fall: number) {
    const slot = step & (this.slots.length - 1);
    this.nextInSlot[i] = this.slots[slot];
    this.slots[slot] = i;
    this.slotOf[i] = slot;
    this.pending[i] = fall;
    this.inWheel[i] = 1;
  }

  // drop i placed at its landing's step (the fall it lands is the one finishing then)
  schedule(i: number, step: number) {
    this.place(i, step, this.layout ? this.falls(i, Math.max(0, step - 1)) : 0);
  }

  // the fall every drop in the wheel is waiting to land, from the layout at the last step: the one whose landing is the next after it (a restart's nominal landings)
  resetPending() {
    if (!this.layout) {
      return;
    }
    for (let i = 0; i < COUNT; i++) {
      if (this.inWheel[i]) {
        this.pending[i] = this.falls(i, this.lastStep);
      }
    }
  }

  // ---- the water's heights ----

  // the table of the surface's rows at the drops' landing places (null: none: the water is calm, flat or off): 4 bytes a drop, the rows of the fall now + BIAS, the rows of the fall before
  // + BIAS and the fall's low byte (the gather pass's picture, models/wavelift.ts); copied. With a table the landings are looked at early (meetLead): the drops in the wheel are placed
  // again when the table comes or goes
  setMeets(table: Uint8Array | null) {
    const was = this.meetCount > 0;
    const n = table ? Math.min(Math.floor(table.length / MEET_STRIDE), COUNT) : 0;
    if (table && n > 0) {
      this.meets.set(table.length === n * MEET_STRIDE ? table : table.subarray(0, n * MEET_STRIDE));
    }
    const before = this.meetCount;
    this.meetCount = n;
    this.packMeets(before);
    if (was !== n > 0) {
      this.rescheduleAll();
    }
  }

  // the table's three bytes of each drop (and bit 24: there is a table) in the fourth word of its life, which the rain's vertex shader reads with the life it already fetches (the head's
  // extension below the floor in a trough needs the surface's rows under the fall that ended); the words of the drops a former, longer table covered cleared; the lives to upload
  packMeets(before: number) {
    const life = this.life;
    const table = this.meets;
    const n = this.meetCount;
    for (let i = 0; i < n; i++) {
      life[i * 4 + 3] = table[i * MEET_STRIDE]! + table[i * MEET_STRIDE + 1]! * 256 + table[i * MEET_STRIDE + 2]! * 65536 + 16777216;
    }
    for (let i = n; i < before; i++) {
      life[i * 4 + 3] = 0;
    }
    const most = Math.max(n, before);
    if (most > 0) {
      this.dirty(0);
      this.dirty(most - 1);
    }
  }

  // the surface's rows over the floor at drop i's landing place for its fall `fall`, from the table: the fall the table was read for or the one before it; 0 with no table, another fall, a drop
  // the table does not cover, or a fall too short to shift; capped
  meetOf(i: number, fall: number): number {
    if (i >= this.meetCount || fall < 0 || this.layout![i * 4 + 3]! < MEET_MIN_ROWS) {
      return 0;
    }
    const table = this.meets;
    const at = i * MEET_STRIDE;
    const read = table[at + 2]!;
    let byte = -1;
    if (read === (fall & 255)) {
      byte = table[at]!;
    } else if (read === ((fall + 1) & 255)) {
      byte = table[at + 1]!;
    }
    return byte < 0 ? 0 : Math.max(-MEET_CAP, Math.min(MEET_CAP, byte - MEET_BIAS));
  }

  // the steps before its nominal landing a drop's landing is looked at (with a table): the head's way to a surface MEET_CAP rows up, in steps, and one more; 0 without a table or for a fall
  // too short to shift
  meetLead(i: number): number {
    const data = this.layout!;
    return this.meetCount > 0 && data[i * 4 + 3]! >= MEET_MIN_ROWS ? Math.ceil((MEET_CAP * 16) / data[i * 4 + 1]!) + 1 : 0;
  }

  // drop i's next landing after a step placed in the wheel: at its nominal step, or earlier by the lead with a table (never before the step after)
  scheduleAfter(i: number, after: number) {
    this.place(i, Math.max(after + 1, this.nextLanding(i, after) - this.meetLead(i)), this.falls(i, after));
  }

  // every drop in the wheel placed again (the table came or went): each at its waiting landing's nominal step less the lead (a landing already due, the next step)
  rescheduleAll() {
    const data = this.layout;
    if (!data) {
      return;
    }
    this.slots.fill(-1);
    const step = this.lastStep;
    for (let i = 0; i < COUNT; i++) {
      if (!this.inWheel[i]) {
        continue;
      }
      // (the landing each drop waits for, wherever it is now: placed at its nominal step less the lead, or the next step if that is past; never another fall's)
      const fall = this.pending[i]!;
      this.place(i, Math.max(step + 1, RL.landingOf(data, i, fall, 0) - this.meetLead(i)), fall);
    }
  }

  // the slot of every drop in the wheel, from the slots' lists (the arrays given by a restart or a restore)
  rebuildSlotOf() {
    let left = COUNT + this.slots.length;
    for (let slot = 0; slot < this.slots.length; slot++) {
      for (let i = this.slots[slot]!; i >= 0 && left-- > 0; i = this.nextInSlot[i]!) {
        this.slotOf[i] = slot;
      }
    }
  }

  // drop i at a step: its head (rows from the top of its fall), rows, fall, place (x, z), its head's height, whether it lands in this step (its head reaches its lowest row) and
  // whether its fall shows; into an object given, or a new one
  dropAt(i: number, step: number, into: Partial<DropState> = {}): DropState {
    const rows = this.layout![i * 4 + 3];
    const distance = this.layout![i * 4];
    const total = this.total(i, step);
    const cycle = Math.floor(total / rows);
    const head = total - cycle * rows;
    into.head = head;
    into.rows = rows;
    into.cycle = cycle;
    into.landed = this.landed(i, step);
    into.shown = this.shows(i, cycle);
    into.x = this.x(i, cycle, distance);
    into.z = -distance;
    into.headY = (rows - 1 - head) * CELL + this.floorAt(distance);
    into.color = into.color || new Float32Array(3);
    return into as DropState;
  }

  // ---- the steps ----

  // the music's scans and credit, the steps and the wave's phase start again with the time (a reset: the effect lays the drops out first), then a clean screen
  resetTime() {
    this.time = 0;
    this.musicAt = -Infinity;
    this.musicCredit = 0;
    this.lastStep = 0;
    this.wavePhase = 0;
    this.waveStep = 0;
    this.restart();
  }

  // step s: the landings of the drops scheduled in it (each shown fall reported, its next fall gated, the drop scheduled again), then the drops that ended and faded let go. lastStep is
  // not moved (the caller's: a frame's steps are run with the last step of the frame before, as the effect's swaps of the layout take place at their steps).
  // With a table of the water's heights a drop in a slot is only looked at: it lands in this step if its rows fallen have reached its fall's last row less the surface's rows m (the head
  // meets the surface), else it is looked at again in the next step; the fall it is the landing of is the fall under way or, just past its wrap, the one before (pendingFall), and a
  // landing past the wrap is reported in that fall, the head below the floor
  runStep(s: number) {
    const mask = this.slots.length - 1;
    let i = this.slots[s & mask]!;
    this.slots[s & mask] = -1;
    const watching = this.meetCount > 0;
    const data = this.layout!;
    while (i >= 0) {
      const next = this.nextInSlot[i]!;
      this.inWheel[i] = 0;
      const fall = this.pending[i]!;
      const rows = data[i * 4 + 3]!;
      const total = this.total(i, s);
      if (total < (fall + 1) * rows - 1 - (watching ? this.meetOf(i, fall) : 0)) {
        this.place(i, s + 1, fall);
        i = next;
        continue;
      }
      const d = this.dropAt(i, s, this.landing);
      if (fall !== d.cycle) {
        d.cycle = fall;
        d.head = total - fall * rows;
        d.headY = (rows - 1 - d.head) * CELL + this.floorAt(data[i * 4]!);
        d.x = this.x(i, fall, data[i * 4]!);
        d.shown = this.shows(i, fall);
        d.landed = true;
      } else if (watching) {
        d.landed = true;
      } else if (M.TEST && !d.landed) {
        this.wrongLandings++;
      }
      if (d.shown) {
        this.colorOf(i, d, s, d.color);
        this.onLand(d, this.clock.timeOf(s));
      }
      this.gate(i, fall + 1);
      if (this.showsAfter(i, fall)) {
        this.place(i, Math.max(s + 1, RL.landingOf(data, i, fall + 1, 0) - this.meetLead(i)), fall + 1);
      }
      i = next;
    }
    this.fade(s);
  }

  // every step from the last one on to `step` (the last step then `step`, or the one it was if later)
  advanceTo(step: number) {
    for (let s = this.lastStep + 1; s <= step; s++) {
      this.runStep(s);
    }
    this.lastStep = Math.max(this.lastStep, step);
  }

  // ---- a stepped model (platform/steppedtask.ts's StepModel) ----

  // the steps done
  get step() {
    return this.lastStep;
  }

  // the next step: its landings reported through onLand; gives their number
  run(): number {
    let landed = 0;
    const onLand = this.onLand;
    this.onLand = (d, t) => {
      landed++;
      onLand(d, t);
    };
    try {
      this.runStep(this.lastStep + 1);
    } finally {
      this.onLand = onLand;
    }
    this.lastStep++;
    return landed;
  }

  // a live input applied before the next step
  event(payload: RainWheelEvent) {
    if (payload.view) {
      Object.assign(this.view, payload.view);
    }
    if (payload.shares !== undefined) {
      this.setShares(payload.shares);
    }
    if (payload.musicLight !== undefined) {
      this.musicLight = payload.musicLight;
    }
    if (payload.layoutPending !== undefined) {
      this.layoutPending = payload.layoutPending;
    }
  }

  // the whole state, plain data (the arrays copied): everything a next step depends on
  snapshot(): RainWheelSnapshot {
    const numbers: Record<string, number | boolean | string> = {};
    for (const key of SCALARS) {
      numbers[key] = this[key];
    }
    const clock = this.clock;
    return {
      numbers,
      view: { ...this.view },
      clock: { from: clock.from, base: clock.base, rate: clock.rate },
      layout: this.layout ? this.layout.slice() : null,
      life: this.life.slice(),
      slots: this.slots.slice(),
      nextInSlot: this.nextInSlot.slice(),
      inWheel: this.inWheel.slice(),
      woken: this.woken.slice(),
      shares: this.shares ? this.shares.slice() : null,
      musicLight: this.musicLight ? this.musicLight.slice() : null,
      colors: this.colors.map((c) => c.slice()),
      meanFallForLayout: !!this.layout && this.meanFallFor === this.layout,
      meets: this.meetCount > 0 ? this.meets.slice(0, this.meetCount * MEET_STRIDE) : null,
      pending: this.pending.slice(),
    };
  }

  restore(s: RainWheelSnapshot) {
    const target = this as unknown as Record<string, number | boolean | string>;
    for (const key of SCALARS) {
      if (key in s.numbers) {
        target[key] = s.numbers[key]!;
      }
    }
    Object.assign(this.view, s.view);
    this.clock.from = s.clock.from;
    this.clock.base = s.clock.base;
    this.clock.rate = s.clock.rate;
    this.layout = s.layout ? s.layout.slice() : null;
    this.life = s.life.slice();
    this.slots = s.slots.slice();
    this.nextInSlot = s.nextInSlot.slice();
    this.inWheel = s.inWheel.slice();
    this.woken = s.woken.slice();
    this.shares = s.shares ? s.shares.slice() : null;
    this.musicLight = s.musicLight ? s.musicLight.slice() : null;
    this.colors = s.colors.map((c) => c.slice());
    this.meanFallFor = s.meanFallForLayout ? this.layout : null;
    this.meanFallRate = this.clock.rate;
    if (s.meets && this.meetCount > 0) {
      this.meets.set(s.meets);
    } else {
      this.meetCount = 0;
    }
    this.rebuildSlotOf();
    if (s.pending) {
      this.pending = s.pending.slice();
    } else {
      this.resetPending();
    }
  }
}

M.RainWheel = RainWheel;
