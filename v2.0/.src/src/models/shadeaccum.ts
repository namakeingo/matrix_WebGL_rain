// ShadeAccum: the sky and moon shade grid's temporal accumulation as a pure model (no GL, no page, importable in any thread; Feature U2, story V1).
// The shade grid follows the same accumulation function as the fog's volume (M.FogAccum): each frame a jittered, reduced bake of the whole grid is expanded to the full grid and blended
// into the held grid with the weight alpha(frame, N), N = FogAccum.FRAMES; a view, setting, size or gap change restarts the average at frame 0; a strike's shadow grid is not accumulated.
// - FACTOR: the reduced grid's factor each way (the volume's FogAccumulation.REDUCE, 2); FRAMES: FogAccum.FRAMES; GAP: the gap in time (s) that resets (Fog's REFRESH_GAP).
// - reducedGrid(across, up, deep, factor): [ra, ru, rd], FogAccum.reduced on each axis.
// - cellOffset(k): the frame k's jitter [jx, jy, jz], FogAccum.jitter(k): the volume's sequence at the same frame.
// - nodeAt(j, n, r, jit): the full grid's index coordinate of the reduced node j of r on an axis of n cells: clamp((j + jit) n / r - 0.5, 0, n - 1).
// - bakeJittered(noise, sigma, time, k, factor, out, front?, layers?, lod?): the reduced grid baked at the nodes' places for the frame k's jitter (QualityFogShade.bakeAt), half pairs,
//   out[((l * ru + y) * ra + x) * 2 + c], c 0 the sky's, 1 the moon's; layers [from, to): only those reduced layers (l counted from `from`).
// - expand(reduced, k, factor, out): the reduced bake read trilinearly at every full cell (the cell i is at the lattice coordinate (i + 0.5) r / n - jit, clamped at the edges)
//   into a Float32Array of the full grid, the layout of bake's with the full columns and rows.
// - accumulate(held, fresh, frame, n): FogAccum.blend with FogAccum.alpha(frame, n), in place.
// - resets(change): any of settings, jump, moved, switched, size (the plan's view, models/fogplan.ts, and the size); jumped(passed): |passed| > GAP; step(frame, change): the next
//   frame index, 0 from -1 or after a reset, else frame + 1.
// - accumulates(kind): FogAccum.accumulates.
//
// Changelog:
// 2026-11-24: bakeJittered(.., layers, lod): the reduced layers by the LOD's lattice (ShadeLod.reduced*), true for the rule or { sx, sy } for forced strides (1 and 1: the whole bake bit for bit) (Feature P1, story P10).
// 2026-11-23: bakeJittered(.., front, layers): the reduced layers [from, to) only (the job's bands, Feature P1 story P8b); the output holds those layers, at the layout of the whole bake from layer `from` on.
// 2026-11-22: new (Feature U2, story V1).
import { M } from "../engine/core";
import { FogAccum } from "./fogaccum";
import type { FrontProfile } from "./quality/fogshade";
import { QualityFogShade } from "./quality/fogshade";
import { ShadeLod } from "./shadelod";

const FACTOR = 2;
const GAP = 0.5;
const ACROSS = QualityFogShade.ACROSS;
const UP = QualityFogShade.UP;
const DEEP = QualityFogShade.DEEP;

interface ShadeChange {
  settings?: boolean;
  jump?: boolean;
  moved?: boolean;
  switched?: boolean;
  size?: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function reducedGrid(across: number, up: number, deep: number, factor: number): number[] {
  return [FogAccum.reduced(across, factor), FogAccum.reduced(up, factor), FogAccum.reduced(deep, factor)];
}

function cellOffset(k: number): number[] {
  return FogAccum.jitter(k);
}

function nodeAt(j: number, n: number, r: number, jit: number): number {
  return clamp(((j + jit) * n) / r - 0.5, 0, n - 1);
}

function bakeJittered(noise: Float32Array, sigma: number, time: number, k: number, factor: number, out: Uint16Array, front?: FrontProfile, layers?: number[], lod?: boolean | { sx: number; sy: number }): void {
  const [ra, ru, rd] = reducedGrid(ACROSS, UP, DEEP, factor) as [number, number, number];
  const jit = cellOffset(k);
  const xs = new Float64Array(ra);
  const ys = new Float64Array(ru);
  const zs = new Float64Array(rd);
  for (let i = 0; i < ra; i++) xs[i] = nodeAt(i, ACROSS, ra, jit[0]!);
  for (let i = 0; i < ru; i++) ys[i] = nodeAt(i, UP, ru, jit[1]!);
  for (let i = 0; i < rd; i++) zs[i] = nodeAt(i, DEEP, rd, jit[2]!);
  if (lod && factor === FACTOR) {
    bakeLodded(noise, sigma, time, out, xs, ys, zs, layers ? layers[0]! : 0, layers ? layers[1]! : rd, lod === true ? 0 : lod.sx, lod === true ? 0 : lod.sy, front);
    return;
  }
  QualityFogShade.bakeAt(noise, sigma, time, out, layers ? zs.subarray(layers[0]!, layers[1]!) : zs, ys, xs, undefined, front);
}

// the reduced layers [from, to) by the LOD's lattice (ShadeLod.reducedColSamples / reducedRowSamples: sx, sy 0, or the strides given): the lattice nodes baked at their places and the rest of each layer interpolated in the node index (the nodes'
// places are linear in it); a layer whose lattice is every node is bakeAt's own, bit for bit
function bakeLodded(noise: Float32Array, sigma: number, time: number, out: Uint16Array, xs: Float64Array, ys: Float64Array, zs: Float64Array, from: number, to: number, sx: number, sy: number, front?: FrontProfile): void {
  const ra = xs.length;
  const ru = ys.length;
  const per = ra * ru * 2;
  const rs = sy > 0 ? ShadeLod.lattice(ru, sy) : ShadeLod.reducedRowSamples();
  for (let j = from; j < to; j++) {
    const cs = sx > 0 ? ShadeLod.lattice(ra, sx) : ShadeLod.reducedColSamples(j);
    const layer = out.subarray((j - from) * per, (j - from + 1) * per);
    const z = zs.subarray(j, j + 1);
    if (cs.length === ra && rs.length === ru) {
      QualityFogShade.bakeAt(noise, sigma, time, layer, z, ys, xs, undefined, front);
      continue;
    }
    const cells = new Uint16Array(cs.length * rs.length * 2);
    QualityFogShade.bakeAt(noise, sigma, time, cells, z, rs.map((i) => ys[i]!), cs.map((i) => xs[i]!), undefined, front);
    const vals = new Float32Array(cells.length);
    for (let i = 0; i < cells.length; i++) {
      vals[i] = QualityFogShade.fromHalf(cells[i]!);
    }
    ShadeLod.spread(vals, cs, rs, 0, ra, 0, ru, layer, QualityFogShade.toHalf);
  }
}

// per full cell of an axis: the two reduced nodes it is read between and the weight of the second
function axisReads(n: number, r: number, jit: number): { i0: Int32Array; i1: Int32Array; w: Float64Array } {
  const i0 = new Int32Array(n);
  const i1 = new Int32Array(n);
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = ((i + 0.5) * r) / n - jit;
    const a = Math.floor(s);
    w[i] = s - a;
    i0[i] = clamp(a, 0, r - 1);
    i1[i] = clamp(a + 1, 0, r - 1);
  }
  return { i0, i1, w };
}

function expand(reduced: Uint16Array, k: number, factor: number, out: Float32Array): void {
  const [ra, ru, rd] = reducedGrid(ACROSS, UP, DEEP, factor) as [number, number, number];
  const jit = cellOffset(k);
  const X = axisReads(ACROSS, ra, jit[0]!);
  const Y = axisReads(UP, ru, jit[1]!);
  const Z = axisReads(DEEP, rd, jit[2]!);
  const rf = new Float32Array(reduced.length);
  for (let i = 0; i < reduced.length; i++) rf[i] = QualityFogShade.fromHalf(reduced[i]!);
  let at = 0;
  for (let z = 0; z < DEEP; z++) {
    for (let y = 0; y < UP; y++) {
      for (let x = 0; x < ACROSS; x++) {
        for (let c = 0; c < 2; c++) {
          const line = (zi: number, yi: number): number => {
            const b = (zi * ru + yi) * ra;
            const v0 = rf[(b + X.i0[x]!) * 2 + c]!;
            return v0 + (rf[(b + X.i1[x]!) * 2 + c]! - v0) * X.w[x]!;
          };
          const plane = (zi: number): number => {
            const p = line(zi, Y.i0[y]!);
            return p + (line(zi, Y.i1[y]!) - p) * Y.w[y]!;
          };
          const p = plane(Z.i0[z]!);
          out[at++] = p + (plane(Z.i1[z]!) - p) * Z.w[z]!;
        }
      }
    }
  }
}

function accumulate(held: Float32Array, fresh: Float32Array, frame: number, n: number = FogAccum.FRAMES): void {
  FogAccum.blend(held, fresh, FogAccum.alpha(frame, n));
}

function resets(change: ShadeChange): boolean {
  return !!(change.settings || change.jump || change.moved || change.switched || change.size);
}

function jumped(passed: number): boolean {
  return Math.abs(passed) > GAP;
}

function step(frame: number, change: ShadeChange): number {
  return frame < 0 || resets(change) ? 0 : frame + 1;
}

function accumulates(kind: string): boolean {
  return FogAccum.accumulates(kind);
}

export const ShadeAccum = { FACTOR, FRAMES: FogAccum.FRAMES, GAP, reducedGrid, cellOffset, nodeAt, bakeJittered, expand, accumulate, resets, jumped, step, accumulates };

M.ShadeAccum = ShadeAccum;
