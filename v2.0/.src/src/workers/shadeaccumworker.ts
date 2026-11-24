// The shade grid's fresh reduced grid as a pure job, done off the render thread (Feature U2, story V3: the worker part "shadeaccum" of the bundle, src/index.ts routes it here; stateless: the input carries the packed noise levels,
// sigma, the time the grid will be shown for, the jitter index and the front profile). Its client is a JobTask (platform/jobtask.ts) made in src/index.ts at the wallpaper's start (inline until its worker is made): Fog.fork asks
// for the grid of an accumulating frame (asks() decides) and the frame waits for the answer, so the grid is uploaded into the fresh texture in the frame it was asked in; the GPU keeps the exact bake. The task is its own: it does not
// use the quality pool, whose last worker is reserved for the bakes of the shade grid.
// - NAME: the task's and the worker part's name; LENGTH: the output's halves (M.ShadeAccumGpu.FRESH: 64 x 32 x 48 nodes x 2)
// - inputOf(noise, sigma, time, k, front?): { noise, sigma, time, k, tail?, tailScale? }
// - job(input): the halves of M.ShadeAccum.bakeJittered(noise, sigma, time, k, FACTOR, out, front) (out[((l * 32 + y) * 64 + x) * 2 + c], c 0 the sky, 1 the moon); pure, the input untouched
// - transferOf(output): [output.buffer]
// - asks(state): whether the frame asks the task: the option and the worker option on, the level of detail off, an exact bake already made, and neither M.ShadeAccum.resets nor jumped
//
// Feature P1, story P8b: read-back-free, banded, lead-driven. The noise is the CPU's (noiseOf(stretch): M.NoiseField's levels 3..7 packed; prepare({stretch, version}) is the warm handler: the worker generates and keeps it
// before its first job, M.JobTask.warmWith / warmed), so the input carries `noise: null` and a version (or the stretch: a thread that was not prepared, such as the main thread's inline run, generates it); `layers: [from, to)`
// makes the job bake those reduced layers only (layersOf splits [0, 48) in bands for the pool's workers but the reserved last one: bandCount); leads(state) is asks plus the Parallax delay over 0 and a warmed worker; the
// steady state asks every m-th frame (cadence) and blends at alphaFor(m) = 1 - (1 - 1/8)^m. The late or lost answer is the ThreadedTask's rule: the same pure job run inline (25 to 40 ms for the whole grid).
//
// Changelog:
// 2026-11-24: the input may carry lod (true or { sx, sy }): the job bakes the reduced layers by the LOD's lattice (Feature P1, story P10).
// 2026-11-23: noiseOf, prepare, forget, layersOf, bandCount, leads, alphaFor, cadence; the input's noise may be null (version, stretch) and may carry layers (Feature P1, story P8b).
// 2026-11-23: new (Feature U2, story V3).
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import { serveJob } from "../platform/jobtask";
import { ShadeAccum } from "../models/shadeaccum";
import { ShadeAccumGpu } from "../models/shadeaccumgpu";
import { QualityFogShade } from "../models/quality/fogshade";
import { NoiseField } from "../models/noisefield";
import { FogAccum } from "../models/fogaccum";

export interface ShadeFreshJob {
  noise: Float32Array | null;
  version?: number;
  stretch?: number;
  layers?: number[];
  // the LOD's lattice of the reduced layers: true the rule (ShadeLod.reduced*), { sx, sy } forced strides (1 and 1: the whole job)
  lod?: boolean | { sx: number; sy: number };
  sigma: number;
  time: number;
  k: number;
  tail?: number;
  tailScale?: number;
}

export interface ShadeAsk {
  option: boolean;
  worker: boolean;
  lod: boolean;
  started: boolean;
  stale: boolean;
  moved: boolean;
  switched: boolean;
  size: boolean;
  passed: number;
}

const NAME = "shadeaccum";
const LENGTH = ShadeAccumGpu.FRESH[0]! * ShadeAccumGpu.FRESH[1]! * ShadeAccumGpu.FRESH[2]! * 2;

const LAYER = ShadeAccumGpu.FRESH[0]! * ShadeAccumGpu.FRESH[1]! * 2;
const LAYERS = ShadeAccumGpu.FRESH[2]!;

// the packed levels 3..7 of the CPU noise (the layout of QualityFogShade.packMips), cached by the stretch
let packed: { stretch: number; noise: Float32Array } | null = null;
// the noise this thread was prepared with (the warm message), by version
let kept: { version: number; noise: Float32Array } | null = null;

function noiseOf(stretch: number): Float32Array {
  if (packed === null || packed.stretch !== stretch) {
    const bytes = NoiseField.bytes(stretch), levels: Uint8Array[] = [];
    let at = 0;
    for (let l = 0; l <= QualityFogShade.MIP_LAST; l++) {
      const n = Math.pow(128 >> l, 3);
      if (l >= QualityFogShade.MIP_FROM) {
        levels.push(bytes.subarray(at, at + n));
      }
      at += n;
    }
    packed = { stretch, noise: QualityFogShade.packMips(levels) };
  }
  return packed.noise;
}

function prepare(input: { stretch: number; version: number }): void {
  kept = { version: input.version, noise: noiseOf(input.stretch) };
}

function forget(): void {
  kept = null;
  packed = null;
}

function layersOf(from: number, to: number, n: number): number[][] {
  const length = Math.max(0, to - from), count = Math.max(1, Math.min(n, length)), base = Math.floor(length / count), rest = length % count, out: number[][] = [];
  let at = from;
  for (let i = 0; i < count; i++) {
    const size = base + (i < rest ? 1 : 0);
    out.push([at, at + size]);
    at += size;
  }
  return out;
}

// the bands of a pool of `poolWorkers`: all its workers but the reserved last one (the shade grid's bakes), at least 1
function bandCount(poolWorkers: number): number {
  return Math.max(1, poolWorkers - 1);
}

// the blend's weight of one job every m frames: the 8-frame average's own, 1 - (1 - 1/8)^m
function alphaFor(m: number): number {
  return 1 - Math.pow(1 - FogAccum.alpha(FogAccum.FRAMES, FogAccum.FRAMES), Math.max(1, Math.floor(m)));
}

// whether the frame asks, for a cadence of one job every m frames
function cadence(frame: number, m: number): boolean {
  return frame % Math.max(1, Math.floor(m)) === 0;
}

function inputOf(noise: Float32Array | null, sigma: number, time: number, k: number, front?: { tail: number; scale: number }, extra?: { version?: number; layers?: number[]; stretch?: number; lod?: boolean | { sx: number; sy: number } }): ShadeFreshJob {
  const input: ShadeFreshJob = { noise, sigma, time, k };
  if (extra) {
    if (extra.version !== undefined) {
      input.version = extra.version;
    }
    if (extra.layers) {
      input.layers = extra.layers;
    }
    if (extra.stretch !== undefined) {
      input.stretch = extra.stretch;
    }
    if (extra.lod) {
      input.lod = extra.lod;
    }
  }
  if (front) {
    input.tail = front.tail;
    input.tailScale = front.scale;
  }
  return input;
}

function noiseFor(input: ShadeFreshJob): Float32Array {
  if (input.noise) {
    return input.noise;
  }
  if (kept !== null && kept.version === input.version) {
    return kept.noise;
  }
  if (input.stretch !== undefined) {
    return noiseOf(input.stretch);
  }
  throw new Error("shade accumulation job: no noise (none given, none prepared for version " + input.version + ", no stretch)");
}

function job(input: ShadeFreshJob): Uint16Array {
  const noise = noiseFor(input), layers = input.layers;
  const out = new Uint16Array(layers ? (layers[1]! - layers[0]!) * LAYER : LENGTH);
  ShadeAccum.bakeJittered(noise, input.sigma, input.time, input.k, ShadeAccum.FACTOR, out, input.tail === undefined ? undefined : { tail: input.tail, scale: input.tailScale as number }, layers, input.lod);
  return out;
}

function transferOf(output: Uint16Array): Transferable[] {
  return [output.buffer as ArrayBuffer];
}

function asks(s: ShadeAsk): boolean {
  return s.option && s.worker && !s.lod && s.started && !ShadeAccum.resets({ settings: s.stale, moved: s.moved, switched: s.switched, size: s.size }) && !ShadeAccum.jumped(s.passed);
}

// whether the frame asks a lead ahead: asks's conditions, the Parallax delay over 0 and a warmed worker
function leads(s: ShadeAsk & { delay: number; warmed: boolean }): boolean {
  return asks(s) && s.delay > 0 && s.warmed;
}

function serve(): void {
  serveJob(workerScope(), job, transferOf, (input) => prepare(input as { stretch: number; version: number }));
}

export const ShadeAccumWorker = { NAME, LENGTH, LAYER, LAYERS, inputOf, job, transferOf, asks, leads, noiseOf, prepare, forget, layersOf, bandCount, alphaFor, cadence, serve };

M.ShadeAccumWorker = ShadeAccumWorker;
