// FogPlan: the fog's frame plan as a pure function (no GL, no page: it runs in a worker too, workers/fogplanworker.ts). Its input carries the frame's exact values (the time, the
// camera's numbers, the settings' flags) and all the state the fog keeps between frames (the refresh credits, the sweep, the slices' periods); its output is what Fog.update decides
// from them: the uniform block's values, the decisions (a setting's change, a gap in time, the view moved, the shade's path switched), the shade grid's draws owed when the GPU alone
// bakes it, the slices' refresh periods, and the runs of slices the volume builds this frame, with the state after. Fog.update does the GL work with the output, inline (the function
// run here) or with the answer its fork asked of the worker in the same frame, so the picture does not depend on where the plan ran.
//
// Changelog:
// 2026-11-10: new, from Fog.update, Fog.setEvery, Fog.due and Fog.buildDue.
// 2026-11-11: same() tells an array from a typed array or a non-array, compares key sets both ways by own property, and takes objects that are not plain data by reference only.
import { M } from "../engine/core";
import { QualityFog } from "./quality/fog";
import type { FogQualityView } from "./quality/fog";
import { MouseParallax } from "./mouseparallax";
import type { ParallaxOffsets } from "./mouseparallax";

// the length of the uniform block's data (floats)
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
  skyGain: ArrayLike<number>;
  moonGain: ArrayLike<number>;
  // the view's decisions: the level of detail, whether the workers' shade schedule exists, the path the last frame took, whether the camera's base changed since the volume was
  // built, the camera's parallax offsets now and those the volume was built for
  lod: boolean;
  hasSched: boolean;
  shadeCpu: boolean;
  baseChanged: boolean;
  offsets: ParallaxOffsets;
  builtFor: ParallaxOffsets;
  // the gap in time that refreshes everything, the shade grid's draws (a count) and its refresh rate (draws a second), its credit and the next draw
  gap: number;
  draws: number;
  shadeRate: number;
  shadeCredit: number;
  shadePart: number;
  // the volume's refresh: the credit of slices, the next slice, the sweeps done, the periods (and octaves dropped) of the slices and the view they were made for (the camera's
  // version, the columns across), and the camera's numbers the periods are worked out from
  sliceCredit: number;
  sliceNext: number;
  sweep: number;
  every: Uint8Array;
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

export interface FogPlanOutput {
  // the uniform block's data
  ubo: Float32Array;
  // false: the passes are not made (only the block is given; the state is the input's)
  scheduled: boolean;
  settings: boolean;
  jump: boolean;
  moved: boolean;
  switched: boolean;
  view: boolean;
  cpu: boolean;
  // the shade grid's draws owed by the time passed when the GPU alone bakes it, as runs [from, to) flattened, their count, the credit and the next draw after (cpu: 0 and 0)
  owed: number;
  shadeBakes: number[];
  shadeCredit: number;
  shadePart: number;
  // the slices' periods and octaves dropped, the camera version and columns they are for
  every: Uint8Array;
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

const SLICES = QualityFog.SLICES;
const VOLUME_RATE = SLICES / QualityFog.SWEEP_SECONDS;

// the slices' refresh periods for the view: every slice every sweep with lod off; made again only when the camera's version or the columns changed (or `all`); by the slice's
// physical level: its transmittance bound; a held slice (level 0) is refreshed the least often: its mirrored volume is read behind the same fog
function periods(input: FogPlanInput, all: boolean, every: Uint8Array, drop: Uint8Array): { everyVersion: number; everyAcross: number } {
  if (!input.lod) {
    every.fill(1);
    drop.fill(0);
    return { everyVersion: -1, everyAcross: input.everyAcross };
  }
  if (!all && input.everyVersion === input.cameraVersion && input.everyAcross === input.columns[0]) {
    return { everyVersion: input.everyVersion, everyAcross: input.everyAcross };
  }
  const view: FogQualityView = {
    inputs: { eyeY: input.eyeY, focal: input.focal, width: input.width, height: input.height, waterDrawn: input.waterDrawn, sigma: input.sigma, air: input.air },
    pitch: input.tilt,
    margin: input.margin,
    across: input.columns[0],
    down: input.columns[1],
  };
  for (let k = 0; k < SLICES; k++) {
    const level = QualityFog.Lod.sliceLevel(view, k);
    const n = QualityFog.Lod.levelRefresh(view, k, level);
    every[k] = n > 0 ? n : QualityFog.Lod.LEVEL_REFRESH_MOST;
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
  d.set(input.skyGain, 24);
  d.set(input.moonGain, 28);
  const every = input.every.slice();
  const drop = input.drop.slice();
  const out: FogPlanOutput = {
    ubo: d,
    scheduled: false,
    settings: false,
    jump: false,
    moved: false,
    switched: false,
    view: false,
    cpu: false,
    owed: 0,
    shadeBakes: [],
    shadeCredit: input.shadeCredit,
    shadePart: input.shadePart,
    every,
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
  const moved = input.baseChanged || MouseParallax.farFrom(input.offsets, input.builtFor);
  const cpu = input.lod && input.hasSched;
  const switched = cpu !== input.shadeCpu;
  const view = settings || jump || moved || switched;
  out.settings = settings;
  out.jump = jump;
  out.moved = moved;
  out.switched = switched;
  out.view = view;
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
  let credit = input.sliceCredit + (view ? 0 : Math.max(0, passed) * VOLUME_RATE);
  const slices = view ? SLICES : Math.min(SLICES, Math.floor(credit + 1e-6));
  credit = view ? 0 : Math.max(0, credit - slices);
  const sliceFrom = view ? 0 : input.sliceNext;
  const made = periods(input, view, every, drop);
  out.everyVersion = made.everyVersion;
  out.everyAcross = made.everyAcross;
  let sweep = input.sweep;
  const due = (k: number) => view || every[k] === 1 || (sweep + (k >> 3)) % every[k] === 0;
  let drawn = 0;
  for (let n = 0; n < slices; ) {
    const from = (sliceFrom + n) % SLICES;
    const to = Math.min(SLICES, from + slices - n);
    // (slices from..to of one sweep: those due, in runs; a sweep done counts for the slices refreshed every N-th one)
    let k = from;
    while (k < to) {
      if (!due(k)) {
        k++;
        continue;
      }
      let end = k + 1;
      while (end < to && due(end)) {
        end++;
      }
      out.runs.push(k, end);
      drawn += end - k;
      k = end;
    }
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

export const FogPlan = { plan, same, FOG_UBO_LENGTH };

M.FogPlan = FogPlan;
