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
// Changelog:
// 2026-11-23: new (Feature U2, story V3).
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import { serveJob } from "../platform/jobtask";
import { ShadeAccum } from "../models/shadeaccum";
import { ShadeAccumGpu } from "../models/shadeaccumgpu";

export interface ShadeFreshJob {
  noise: Float32Array;
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

function inputOf(noise: Float32Array, sigma: number, time: number, k: number, front?: { tail: number; scale: number }): ShadeFreshJob {
  const input: ShadeFreshJob = { noise, sigma, time, k };
  if (front) {
    input.tail = front.tail;
    input.tailScale = front.scale;
  }
  return input;
}

function job(input: ShadeFreshJob): Uint16Array {
  const out = new Uint16Array(LENGTH);
  ShadeAccum.bakeJittered(input.noise, input.sigma, input.time, input.k, ShadeAccum.FACTOR, out, input.tail === undefined ? undefined : { tail: input.tail, scale: input.tailScale as number });
  return out;
}

function transferOf(output: Uint16Array): Transferable[] {
  return [output.buffer as ArrayBuffer];
}

function asks(s: ShadeAsk): boolean {
  return s.option && s.worker && !s.lod && s.started && !ShadeAccum.resets({ settings: s.stale, moved: s.moved, switched: s.switched, size: s.size }) && !ShadeAccum.jumped(s.passed);
}

function serve(): void {
  serveJob(workerScope(), job, transferOf);
}

export const ShadeAccumWorker = { NAME, LENGTH, inputOf, job, transferOf, asks, serve };

M.ShadeAccumWorker = ShadeAccumWorker;
