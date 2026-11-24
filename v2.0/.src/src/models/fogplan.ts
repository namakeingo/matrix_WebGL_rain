// FogPlan: the fog's frame plan as a pure function (no GL, no page: it runs in a worker too, workers/fogplanworker.ts). Its input carries the frame's exact values (the time, the
// camera's numbers, the settings' flags) and all the state the fog keeps between frames (the refresh credits, the sweep, the slices' periods); its output is what Fog.update decides
// from them: the uniform block's values, the decisions (a setting's change, a gap in time, the view moved, the shade's path switched), the shade grid's draws owed when the GPU alone
// bakes it, the slices' refresh periods, and the runs of slices the volume builds this frame, with the state after. Fog.update does the GL work with the output, inline (the function
// run here) or with the answer its fork asked of the worker in the same frame, so the picture does not depend on where the plan ran.
//
// Changelog:
// 2026-11-23: ViewLead.asked: the decision of the last ask (its `moved` at ask time orders the base mist's jobs).
// 2026-11-23: the view's decision for the pose of the release frame (Parallax delay as lead time): ahead() (the move decision and the pose a build is ordered for, pure), the input's `ahead` (the decision the lead released), the output's builtFor, offsetsOfPose, ViewLead (the schedule of the asks, M.ParallaxLead.Lane's rule).
// 2026-11-23: the lens is no move of the view: the block is 32 floats, fLens at 28 to 31 (lensShift: the read's shift and the lens delta in pixels, against the lens the volume is built for); a rebuild (any cause) is built for the lens now: no delta in the block, the periods for the lens now, else the built one.
// 2026-11-22: no refresh periods (`every`, due): the volume is blended by the temporal accumulation, every slice the time passed owes is built; the octaves read as their mean (`drop`) stay.
// 2026-11-20: the block is 28 floats: no sky gain, the Orb's gain at 24 (Feature S1, story A2).
// 2026-11-18: the lens (lensX, lensY, builtLensX, builtLensY): a lens other than the one the volume was built for is a move of the view; the periods' view carries the lens.
// 2026-11-10: new, from Fog.update, Fog.setEvery, Fog.due and Fog.buildDue.
// 2026-11-11: same() tells an array from a typed array or a non-array, compares key sets both ways by own property, and takes objects that are not plain data by reference only.
import { M } from "../engine/core";
import { QualityFog } from "./quality/fog";
import type { FogQualityView } from "./quality/fog";
import { MouseParallax } from "./mouseparallax";
import { StaticMist } from "./staticmist";
import { ParallaxLead } from "./parallaxlead";
import type { ParallaxOffsets } from "./mouseparallax";
import type { ParallaxPoseOffsets } from "./parallaxpose";

// the length of the uniform block's data (floats)
// (8 vec4: the flat sky's gain vec4 is gone with the flat sky; the Orb's gain is at 24; fLens, the lens shift of the read, is at 28)
export const FOG_UBO_LENGTH = 32;

export interface FogPlanInput {
  // the frame's time, the time of the last frame planned, whether a setting changed since (Fog.stale), whether the passes are made and the fog on (the schedule is only worked out then)
  time: number;
  lastTime: number;
  stale: boolean;
  built: boolean;
  // the uniform block: sigma, whether the fog is on, whether a strike's light shines, the colors, the volume's columns, its margin, each strike slot's level when shown (0: not shown)
  // and the scale it is divided by, the bolt's color, the march's segments, the sky's and the moon's gains
  sigma: number;
  // the base mist's extinction at the water per metre (Fog.baseStrength()): read by the level of detail's coverage only (the block no longer carries it); absent: 0
  mist?: number;
  // the front cloud's profile: the tail's share and scale (Fog.frontTail(), frontScale(); absent: the shipped defaults), written into the block's floats 7 and 27
  tail?: number;
  tailScale?: number;
  on: boolean;
  shining: boolean;
  colorMain: ArrayLike<number>;
  colorSecondary: ArrayLike<number>;
  columns: number[];
  margin: number;
  strike: number[];
  strikeScale: number;
  boltColor: ArrayLike<number>;
  marchSegments: number;
  moonGain: ArrayLike<number>;
  // the view's decisions: the level of detail, whether the workers' shade schedule exists, the path the last frame took, whether the camera's base changed since the volume was
  // built, the camera's parallax offsets now and those the volume was built for
  lod: boolean;
  // the tests' switch (M.TEST only, Fog.coverage): false leaves the perceptual level out of the level of detail (the physical level alone); absent or true: the shipped one
  coverage?: boolean;
  hasSched: boolean;
  shadeCpu: boolean;
  baseChanged: boolean;
  offsets: ParallaxOffsets;
  builtFor: ParallaxOffsets;
  // the decision the lead released for this frame (ViewLead.release): whether the offsets of the frame are a move and the pose the build was ordered for; absent: decided here from offsets and builtFor
  ahead?: ViewDecision;
  // the camera's lens now and the one the volume was built for (device pixels, Camera.lens; absent: 0): a lens other than the built one is no move of the view: the read is shifted by the delta (lensShift, the block's floats 28 to 31)
  lensX?: number;
  lensY?: number;
  builtLensX?: number;
  builtLensY?: number;
  // the gap in time that refreshes everything, the shade grid's draws (a count) and its refresh rate (draws a second), its credit and the next draw
  gap: number;
  draws: number;
  shadeRate: number;
  // the factor of VOLUME_RATE (the volume's slices a second) where a test changes it; undefined: 1
  volumeScale?: number;
  shadeCredit: number;
  shadePart: number;
  // the volume's refresh: the credit of slices, the next slice, the sweeps done, the octaves dropped per slice and the view they were made for (the camera's
  // version, the columns across), and the camera's numbers they are worked out from
  sliceCredit: number;
  sliceNext: number;
  sweep: number;
  drop: Uint8Array;
  everyVersion: number;
  everyAcross: number;
  cameraVersion: number;
  eyeY: number;
  focal: number;
  width: number;
  height: number;
  tilt: number;
  air: number;
  waterDrawn: boolean;
}

// the view's decision: moved, and the pose a build is for
export interface ViewDecision {
  moved: boolean;
  builtFor: ParallaxOffsets;
}

export interface FogPlanOutput {
  // the uniform block's data
  ubo: Float32Array;
  // false: the passes are not made (only the block is given; the state is the input's)
  scheduled: boolean;
  settings: boolean;
  jump: boolean;
  moved: boolean;
  // the pose a rebuild is for: the lead's ordered pose when it moved, else the offsets when the base changed, else the one built before (Fog.update keeps it as builtFor)
  builtFor: ParallaxOffsets;
  switched: boolean;
  view: boolean;
  cpu: boolean;
  // the shade grid's draws owed by the time passed when the GPU alone bakes it, as runs [from, to) flattened, their count, the credit and the next draw after (cpu: 0 and 0)
  owed: number;
  shadeBakes: number[];
  shadeCredit: number;
  shadePart: number;
  // the octaves dropped per slice, the camera version and columns they are for
  drop: Uint8Array;
  everyVersion: number;
  everyAcross: number;
  // the slices owed, where the sweep starts, the credit and the next slice after, the sweeps done after, the runs [from, to) of slices built flattened, their count
  slices: number;
  sliceFrom: number;
  sliceCredit: number;
  sliceNext: number;
  sweep: number;
  runs: number[];
  drawn: number;
}

// the pose as ParallaxPose gives it, as the plan's offsets (Camera.setParallax's names); the values are untouched
function offsetsOfPose(p: ParallaxPoseOffsets): ParallaxOffsets {
  return { yaw: p.yaw, pitchShift: p.pitch, eyeX: p.eyeX, eyeShift: p.eyeY };
}

// the move decision for a pose (the offsets the view shows at a frame, or the target pose asked ahead): moved when the base changed or the pose is far from the one the build is for; builtFor the pose then
function ahead(input: { offsets: ParallaxOffsets; builtFor: ParallaxOffsets; baseChanged: boolean }): ViewDecision {
  const moved = input.baseChanged || MouseParallax.farFrom(input.offsets, input.builtFor);
  const b = moved ? input.offsets : input.builtFor;
  return { moved, builtFor: { yaw: b.yaw, pitchShift: b.pitchShift, eyeX: b.eyeX, eyeShift: b.eyeShift } };
}

const SLICES = QualityFog.SLICES;
const VOLUME_RATE = SLICES / QualityFog.SWEEP_SECONDS;

// the read's compensation for a lens other than the one the volume was built for: [sx, sy, dx, dy] with dx, dy the lens delta in pixels (lens - built lens, y up as the camera's) and sx, sy the shift of the
// volume's coordinate, minus the delta over the volume's span (the window and its margin on each side: size x (1 + 2 margin), the volume's own margin). A fragment at the lens l reads the column built
// for the ray it has, the fragment minus the delta. The coordinate stays inside the volume while |delta| <= margin x size (0.1 x size: 50 px, the OLED's whole range, for a window of 500 px or more); past
// it the texture's edge clamps the read. Absent lenses count as 0
function lensShift(lensX: number, lensY: number, builtLensX: number, builtLensY: number, width: number, height: number, margin: number): number[] {
  const dx = (lensX || 0) - (builtLensX || 0), dy = (lensY || 0) - (builtLensY || 0);
  return [-dx / (width * (1 + 2 * margin)), -dy / (height * (1 + 2 * margin)), dx, dy];
}

// the octaves each slice's gather reads as their mean for the view: none with lod off; made again only when the camera's version or the columns changed (or `all`); by the slice's level
function periods(input: FogPlanInput, all: boolean, drop: Uint8Array, lensX: number, lensY: number): { everyVersion: number; everyAcross: number } {
  if (!input.lod) {
    drop.fill(0);
    return { everyVersion: -1, everyAcross: input.everyAcross };
  }
  if (!all && input.everyVersion === input.cameraVersion && input.everyAcross === input.columns[0]) {
    return { everyVersion: input.everyVersion, everyAcross: input.everyAcross };
  }
  const view: FogQualityView = {
    inputs: { eyeY: input.eyeY, focal: input.focal, width: input.width, height: input.height, lensX, lensY, waterDrawn: input.waterDrawn, sigma: input.sigma, air: input.air, mist: input.mist || 0, tail: input.tail, tailScale: input.tailScale },
    pitch: input.tilt,
    margin: input.margin,
    across: input.columns[0],
    down: input.columns[1],
  };
  for (let k = 0; k < SLICES; k++) {
    const level = input.coverage === false ? QualityFog.Lod.sliceLevel(view, k) : QualityFog.Lod.fullLevel(view, k);
    drop[k] = QualityFog.Lod.levelOctaves(view, k, level);
  }
  return { everyVersion: input.cameraVersion, everyAcross: input.columns[0] };
}

function plan(input: FogPlanInput): FogPlanOutput {
  const d = new Float32Array(FOG_UBO_LENGTH);
  d[0] = input.sigma;
  d[1] = input.time;
  d[2] = !input.on ? -1 : input.built ? 1 : 0;
  d[3] = input.built && input.shining ? 1 : 0;
  d.set(input.colorMain, 4);
  d.set(input.colorSecondary, 8);
  d[12] = input.columns[0];
  d[13] = input.columns[1];
  d[14] = input.columns[2];
  d[15] = input.margin;
  for (let slot = 0; slot < input.strike.length; slot++) {
    d[16 + slot] = input.strike[slot] / input.strikeScale;
  }
  d.set(input.boltColor, 20);
  d[23] = input.marchSegments;
  d.set(input.moonGain, 24);
  d[7] = input.tail === undefined ? StaticMist.TAIL_SHARE : input.tail;
  d[27] = input.tailScale === undefined ? StaticMist.TAIL_SCALE : input.tailScale;
  d.set(lensShift(input.lensX || 0, input.lensY || 0, input.builtLensX || 0, input.builtLensY || 0, input.width, input.height, input.margin), 28);
  // (the block's floats 7 and 27 (fMain.w, fMoonGain.w) are the front cloud's tail share and scale since Feature U3, story M4; fSecond.w, float 11, is the effect's base-volume flag)
  const drop = input.drop.slice();
  const out: FogPlanOutput = {
    ubo: d,
    scheduled: false,
    settings: false,
    jump: false,
    moved: false,
    // (the offsets are read only when the passes are made: a caller of the block alone may give none)
    builtFor: input.builtFor ? { yaw: input.builtFor.yaw, pitchShift: input.builtFor.pitchShift, eyeX: input.builtFor.eyeX, eyeShift: input.builtFor.eyeShift } : input.builtFor,
    switched: false,
    view: false,
    cpu: false,
    owed: 0,
    shadeBakes: [],
    shadeCredit: input.shadeCredit,
    shadePart: input.shadePart,
    drop,
    everyVersion: input.everyVersion,
    everyAcross: input.everyAcross,
    slices: 0,
    sliceFrom: input.sliceNext,
    sliceCredit: input.sliceCredit,
    sliceNext: input.sliceNext,
    sweep: input.sweep,
    runs: [],
    drawn: 0,
  };
  if (!input.built) {
    return out;
  }
  out.scheduled = true;
  const settings = input.stale;
  const passed = input.time - input.lastTime;
  const jump = Math.abs(passed) > input.gap;
  const poseMoved = input.ahead ? input.ahead.moved : MouseParallax.farFrom(input.offsets, input.builtFor);
  const moved = input.baseChanged || poseMoved;
  if (moved) {
    // (the pose the lead ordered the build for when it moved; the frame's own offsets for a base change alone, or without a lead)
    const b = input.ahead && input.ahead.moved ? input.ahead.builtFor : input.offsets;
    out.builtFor = { yaw: b.yaw, pitchShift: b.pitchShift, eyeX: b.eyeX, eyeShift: b.eyeShift };
  }
  // (the lens is no move of the view: the read follows it, lensShift)
  const cpu = input.lod && input.hasSched;
  const switched = cpu !== input.shadeCpu;
  const view = settings || jump || moved || switched;
  out.settings = settings;
  out.jump = jump;
  out.moved = moved;
  out.switched = switched;
  out.view = view;
  // (a rebuild is for the lens now, which the fog re-bases builtLens to in this frame: no delta in the block)
  if (view) {
    d.fill(0, 28);
  }
  out.cpu = cpu;
  // the shade grid's draws (the GPU alone): the time passed owes them at the rate, all after a change of the view, a setting or a gap
  const draws = input.draws;
  if (cpu) {
    out.shadeCredit = 0;
    out.shadePart = 0;
  } else {
    let credit = input.shadeCredit + (view ? 0 : Math.max(0, passed) * input.shadeRate);
    const owed = view ? draws : Math.min(draws, Math.floor(credit + 1e-6));
    credit = view ? 0 : Math.max(0, credit - owed);
    const from0 = view ? 0 : input.shadePart;
    for (let n = 0; n < owed; ) {
      const from = (from0 + n) % draws;
      const to = Math.min(draws, from + owed - n);
      out.shadeBakes.push(from, to);
      n += to - from;
    }
    out.owed = owed;
    out.shadeCredit = credit;
    out.shadePart = (from0 + owed) % draws;
  }
  // the volume's slices: the time passed owes them at the rate (from where the last frame stopped), all of them when the view changed
  let credit = input.sliceCredit + (view ? 0 : Math.max(0, passed) * (input.volumeScale === undefined ? 1 : input.volumeScale) * VOLUME_RATE);
  const slices = view ? SLICES : Math.min(SLICES, Math.floor(credit + 1e-6));
  credit = view ? 0 : Math.max(0, credit - slices);
  const sliceFrom = view ? 0 : input.sliceNext;
  // (the periods' view carries the lens the volume is built for: the lens now in a rebuild, which the fog re-bases to, else the built one)
  const made = periods(input, view, drop, (view ? input.lensX : input.builtLensX) || 0, (view ? input.lensY : input.builtLensY) || 0);
  out.everyVersion = made.everyVersion;
  out.everyAcross = made.everyAcross;
  let sweep = input.sweep;
  let drawn = 0;
  for (let n = 0; n < slices; ) {
    const from = (sliceFrom + n) % SLICES;
    const to = Math.min(SLICES, from + slices - n);
    // (slices from..to of one sweep: all of them, one run)
    out.runs.push(from, to);
    drawn += to - from;
    if (to === SLICES) {
      sweep++;
    }
    n += to - from;
  }
  out.slices = slices;
  out.sliceFrom = sliceFrom;
  out.sliceCredit = credit;
  out.sliceNext = (sliceFrom + slices) % SLICES;
  out.sweep = sweep;
  out.drawn = drawn;
  return out;
}

// whether two inputs are the same value for value (numbers, flags, arrays and the offsets' objects)
function same(a: unknown, b: unknown): boolean {
  if (a === b || (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b))) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  const listA = ArrayBuffer.isView(a) || Array.isArray(a);
  const listB = ArrayBuffer.isView(b) || Array.isArray(b);
  if (listA || listB) {
    // (an array only with an array, a typed array only with one of its own kind)
    if (!listA || !listB || Array.isArray(a) !== Array.isArray(b) || (!Array.isArray(a) && a.constructor !== b.constructor)) {
      return false;
    }
    const x = a as ArrayLike<unknown>;
    const y = b as ArrayLike<unknown>;
    if (x.length !== y.length) {
      return false;
    }
    for (let i = 0; i < x.length; i++) {
      if (!same(x[i], y[i])) {
        return false;
      }
    }
    return true;
  }
  // (an object that is not plain data, a Map, a Date, a class instance: the same only by reference)
  const plain = (o: object) => {
    const proto = Object.getPrototypeOf(o);
    return proto === Object.prototype || proto === null;
  };
  if (!plain(a) || !plain(b)) {
    return false;
  }
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) {
    return false;
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) {
      return false;
    }
    if (!same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

const sameOffsets = (a: ParallaxOffsets, b: ParallaxOffsets): boolean => a.yaw === b.yaw && a.pitchShift === b.pitchShift && a.eyeX === b.eyeX && a.eyeShift === b.eyeShift;
const copyOffsets = (o: ParallaxOffsets): ParallaxOffsets => ({ yaw: o.yaw, pitchShift: o.pitchShift, eyeX: o.eyeX, eyeShift: o.eyeShift });

interface Ask {
  id: number;
  releaseMs: number;
  target: ParallaxOffsets;
  from: ParallaxOffsets;
  decision: ViewDecision;
}

interface ViewRelease {
  moved: boolean;
  builtFor: ParallaxOffsets;
  by: "lead" | "inline";
  obsolete: boolean;
  taken: number;
}

// the schedule of the view's decision with the Parallax delay as lead: ask(ms, target pose) decides at once against the pose the last asked build is ordered for (`ordered`) and releases that decision a lead later
// (M.ParallaxLead.Lane's rule: each ask once, in order, when its time has come); release(ms, shown) gives the frame's decision: the last due ask's when its target is the pose shown (within the plan's own
// tolerance: frame times are only predicted) and it was decided against the pose released before (`built`), else an inline decision from the shown pose, which drops the asks waiting. The ms are the clock the
// caller keeps (Fog.update's time x 1000); only differences between them are read
class ViewLead {
  delay: number;
  ordered: ParallaxOffsets = { yaw: 0, pitchShift: 0, eyeX: 0, eyeShift: 0 };
  built: ParallaxOffsets = { yaw: 0, pitchShift: 0, eyeX: 0, eyeShift: 0 };
  // the decision of the last ask (at ask time: moved says a view change is ordered for the target pose)
  asked: ViewDecision = { moved: false, builtFor: { yaw: 0, pitchShift: 0, eyeX: 0, eyeShift: 0 } };
  private queue: Ask[] = [];
  private serial = 0;

  constructor(delay: number) {
    this.delay = delay;
  }

  ask(ms: number, target: ParallaxOffsets, baseChanged: boolean): number {
    const decision = ahead({ offsets: target, builtFor: this.ordered, baseChanged });
    const id = ++this.serial;
    this.queue.push({ id, releaseMs: ms + ParallaxLead.lead(this.delay) * 1000, target: copyOffsets(target), from: this.ordered, decision });
    this.ordered = decision.builtFor;
    this.asked = decision;
    return id;
  }

  release(ms: number, shown: ParallaxOffsets, baseChanged: boolean): ViewRelease {
    const due: Ask[] = [];
    while (this.queue.length > 0 && this.queue[0]!.releaseMs <= ms + ParallaxLead.TOLERANCE_MS) {
      due.push(this.queue.shift()!);
    }
    const last = due.length > 0 ? due[due.length - 1]! : null;
    // (the chain: the first due ask was decided against the pose released before it)
    if (last && !MouseParallax.farFrom(last.target, shown) && sameOffsets(due[0]!.from, this.built)) {
      const anyMoved = due.some((a) => a.decision.moved);
      const builtFor = anyMoved ? copyOffsets(last.decision.builtFor) : baseChanged ? copyOffsets(shown) : copyOffsets(this.built);
      this.built = builtFor;
      return { moved: anyMoved || baseChanged, builtFor: copyOffsets(builtFor), by: "lead", obsolete: false, taken: due.length };
    }
    const d = ahead({ offsets: shown, builtFor: this.built, baseChanged });
    this.built = d.builtFor;
    const obsolete = last !== null;
    if (obsolete) {
      this.queue = [];
    }
    if (this.queue.length === 0) {
      this.ordered = this.built;
    }
    return { moved: d.moved, builtFor: copyOffsets(d.builtFor), by: "inline", obsolete, taken: due.length };
  }

  pending(): number {
    return this.queue.length;
  }
}

export const FogPlan = { plan, same, FOG_UBO_LENGTH, lensShift, offsetsOfPose, ahead, ViewLead };

M.FogPlan = FogPlan;
