// The base mist's culling and level of detail (Feature U3, story M5; units.ui.m5lod.ts). Pure, no GL, importable in any thread. The base mist's volume is cumulative along each column, so a column needs the PREFIX of
// slices 0 .. n - 1; nothing past the slice where the base mist has become opaque is ever read.
// - level(k, focal) in 0 .. LEVELS: 0 (flat: the shader skips the noise, the density is base e^(-y / HB)) only where the coarsening's amplitude at the slice's middle is 0 (the modulation is exactly 1: exact); else
//   max(1, ceil(LEVELS amplitude)). (A flat level for a weak base, taken where base amplitude thickness is small, was dropped: it is not exact, and the noise matters in the near slices at any strength.)
// - rayEnd: the distance past which an UPPER BOUND of a ray's transmittance is under TAIL_T. Beyond R = M.StaticMist.resolvableDistance(focal) the modulation is exactly 1, so the base's density is the closed-form layer
//   and T(a) <= exp(-(air a + baseDepth(base, HB, eyeY, dy, R, a))); before R the noise window reaches 0, so only the air counts. The mirrored ray (below still water, read by the reflection) is the same bound on the
//   ray y = -eyeY - dy s from where it meets the water. A column's end is the largest of its own and its eight neighbours' rays' ends (the pixels the column serves); a ray going down with the water drawn also needs
//   the slices to the plane CULL_BELOW under the water (the direct volume's reads end there), with the front's slack CULL_RELATIVE
// - slicesOf(view, ix, iy, focal): the slices k with sliceStart(k) <= the column's end; counts(view, focal); plan(on, view, focal): lod off gives every column all SLICES and every level LEVELS
// The view is a M.QualityFog view (FogQualityView) whose inputs.mist is the base's strength.
//
// Changelog:
// 2026-11-22: new (Feature U3, story M5).
// 2026-11-22: level: flat only where the amplitude is 0 (the strength rule is gone: it made the near slices flat at low Fog intensity, which changed the volume).
import { M } from "../engine/core";
import { BaseMist } from "../engine/basemist";
import { QualityFog } from "./quality/fog";
import type { FogQualityView } from "./quality/fog";
import { StaticMist } from "./staticmist";

const LEVELS = 40;

const sliceMid = (k: number): number => 0.5 * (BaseMist.sliceStart(k) + BaseMist.sliceStart(k + 1));

function level(k: number, focal: number): number {
  const amplitude = StaticMist.coarsen(sliceMid(k), focal).amplitude;
  if (amplitude <= 0) return 0;
  return Math.min(LEVELS, Math.max(1, Math.ceil(LEVELS * amplitude)));
}

// the least distance at which air a + depth(a) reaches the target, the depth a closed-form integral that is 0 up to `from` and rises with a (Infinity: it does not reach it within the volume's far end)
function reach(air: number, target: number, from: number, depth: (a: number) => number): number {
  const far = BaseMist.FAR;
  if (air * from >= target) return target / air;
  if (air * far + depth(far) < target) return Infinity;
  let lo = from, hi = far;
  for (let i = 0; i < 200 && hi - lo > 1e-9 * hi; i++) {
    const mid = 0.5 * (lo + hi);
    if (air * mid + depth(mid) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

// the end of one ray of slope dy: the direct ray, or (mirrored) the reflected ray from the water
function rayEnd(view: FogQualityView, dy: number, focal: number, mirrored: boolean): number {
  const i = view.inputs, base = i.mist || 0, air = i.air, eye = i.eyeY, R = StaticMist.resolvableDistance(focal), target = Math.log(1 / QualityFog.TAIL_T);
  if (!mirrored) {
    return reach(air, target, R, (a) => (a > R ? StaticMist.baseDepth(base, BaseMist.HB, eye, dy, R, a) : 0));
  }
  const hit = eye / -dy, from = Math.max(hit, R);
  return reach(air, target, from, (a) => (a > from ? StaticMist.baseDepth(base, BaseMist.HB, -eye, -dy, from, a) : 0));
}

// the end of the ray through the column (ix, iy)'s middle (a column past the volume's edge included)
function pointEnd(view: FogQualityView, ix: number, iy: number, focal: number): number {
  const dy = QualityFog.columnDy(view, ix, iy);
  if (view.inputs.waterDrawn && dy < -1e-6) {
    return Math.max(((view.inputs.eyeY + QualityFog.CULL_BELOW) / -dy) * (1 + QualityFog.CULL_RELATIVE), rayEnd(view, dy, focal, true));
  }
  return rayEnd(view, dy, focal, false);
}

// the end of a column: the largest end over the column and its eight neighbours (every one of the rays the column serves)
function denseEnd(view: FogQualityView, ix: number, iy: number, focal: number): number {
  let end = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) end = Math.max(end, pointEnd(view, ix + i, iy + j, focal));
  return end;
}

// every column's end at once: the points' ends (one more ring around the volume) computed once, each column's the largest of its 3 x 3
function columnEnds(view: FogQualityView, focal: number): Float64Array {
  const w = view.across + 2, h = view.down + 2, points = new Float64Array(w * h), out = new Float64Array(view.across * view.down);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) points[y * w + x] = pointEnd(view, x - 1, y - 1, focal);
  for (let y = 0; y < view.down; y++) {
    for (let x = 0; x < view.across; x++) {
      let end = 0;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) end = Math.max(end, points[(y + j) * w + x + i]!);
      out[y * view.across + x] = end;
    }
  }
  return out;
}

// the slices whose start is within an end
function slicesTo(end: number): number {
  if (end === Infinity) return BaseMist.SLICES;
  let n = 0;
  while (n < BaseMist.SLICES && BaseMist.sliceStart(n) <= end) n++;
  return n;
}

const columnLimit = denseEnd;

function slicesOf(view: FogQualityView, ix: number, iy: number, focal: number): number {
  return slicesTo(denseEnd(view, ix, iy, focal));
}

function flatSlices(focal: number): number {
  let n = 0;
  for (let k = 0; k < BaseMist.SLICES; k++) if (level(k, focal) === 0) n++;
  return n;
}

function counts(view: FogQualityView, focal: number): { columns: number; full: number; cells: number; culledColumns: number; flatSlices: number } {
  const columns = view.across * view.down;
  let cells = 0, culled = 0;
  const ends = columnEnds(view, focal);
  for (let c = 0; c < ends.length; c++) {
    const n = slicesTo(ends[c]!);
    cells += n;
    if (n < BaseMist.SLICES) culled++;
  }
  return { columns, full: columns * BaseMist.SLICES, cells, culledColumns: culled, flatSlices: flatSlices(focal) };
}

function plan(on: boolean, view: FogQualityView, focal: number): { slices: Uint16Array; levels: Uint8Array } {
  const slices = new Uint16Array(view.across * view.down).fill(BaseMist.SLICES), levels = new Uint8Array(BaseMist.SLICES).fill(LEVELS);
  if (!on) return { slices, levels };
  const ends = columnEnds(view, focal);
  for (let c = 0; c < ends.length; c++) slices[c] = slicesTo(ends[c]!);
  for (let k = 0; k < BaseMist.SLICES; k++) levels[k] = level(k, focal);
  return { slices, levels };
}

export const BaseLod = { LEVELS, sliceMid, level, denseEnd, columnLimit, slicesOf, counts, plan };

M.BaseLod = BaseLod;
