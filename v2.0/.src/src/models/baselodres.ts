// The base mist's resolution by distance as a pure model (Feature P1, base mist, story 2; units.ui.baselodres.ts; no GL, no page, importable in any thread). The accumulation of the base volume is made, for each slice, on a lattice of columns
// (the full columns divided by a factor): today one factor for all of them (2 on the GPU, 8 on the worker). The base mist's noise has features of 0.5 m and a column's footprint at the slice's distance d is d / focal metres (focal in columns), so the
// near slices are far over-resolved and the slices past the resolvable distance (the flat ones) are smooth in the ray's direction: their lattice can be coarser. The factor of slice k is max(the path's own, the stride by distance), so a slice that needs
// the path's factor keeps it and the picture changes only where the factor grows.
// - SPACING_M 0.25 (half a feature: the lattice's spacing), MAX_STRIDE 32, RETIRED_STRIDE 8 (the flat slices); spacing and maxStride are the values strideOf reads (mutable, default SPACING_M and MAX_STRIDE: the tests' sweep)
// - strideOf(k, focal): RETIRED_STRIDE for a retired slice (M.BaseLod.retired); else clamp(pow2floor(SPACING_M focal / M.BaseLod.sliceMid(k)), 1, MAX_STRIDE)
// - factorOf(k, focal, base) = max(base, strideOf(k, focal)); table(focal, base): the Uint8Array of factorOf over the slices
// - classes(factors, covered): the distinct factors of the slices 0 .. covered - 1 in ascending order, each with its slices in order
// - layoutOf(factors, covered, across, down): the output of the job by class: { classes: [{ factor, ra, rd, slices, offset, length }], length }: each class its slices in order, each slice its two planes (direct, mirrored) of ra x rd x 4 halves; offset
//   and length in halves; ra and rd are the lattice of the factor (M.FogAccum.reduced)
// - layoutOf(factors, covered, across, down, band?): with band { from, to, head } the output of ONE ROW BAND (M.BaseMistBands): the class of the table's smallest factor (over all the slices, the first class when a covered slice has it) holds only the lattice rows [from, to) (its rd is
//   to - from) and the other classes are present only for the head band, whole
// - bilinear(plane, ra, rd, sx, sy, jx, jy, X, Y, c): channel c of a lattice picture (4 values a node, index (y ra + x) 4 + c) at the full-column position (X, Y): the nodes sit at ((x + jx) sx, (y + jy) sy), the value is bilinear between the four around, the
//   edge's beyond them
//
// Changelog:
// 2026-11-25: layoutOf(.., band): the layout of a row band's output.
// 2026-11-24: new (Feature P1, base mist resolution by distance, story 2).
// 2026-11-24: strideOf reads the mutable BaseLodRes.spacing and BaseLodRes.maxStride (defaults SPACING_M, MAX_STRIDE).
import { M } from "../engine/core";
import { BaseLod } from "./baselod";
import { BaseMist } from "../engine/basemist";
import { FogAccum } from "./fogaccum";

const SPACING_M = 0.25;
const MAX_STRIDE = 32;
const RETIRED_STRIDE = 8;

const pow2floor = (v: number): number => Math.pow(2, Math.floor(Math.log2(Math.max(v, 1e-9))));

function strideOf(k: number, focal: number): number {
  if (BaseLod.retired(k, focal)) {
    return RETIRED_STRIDE;
  }
  return Math.min(BaseLodRes.maxStride, Math.max(1, pow2floor((BaseLodRes.spacing * focal) / BaseLod.sliceMid(k))));
}

function factorOf(k: number, focal: number, base: number): number {
  return Math.max(base, strideOf(k, focal));
}

function table(focal: number, base: number): Uint8Array {
  const out = new Uint8Array(BaseMist.SLICES);
  for (let k = 0; k < out.length; k++) {
    out[k] = factorOf(k, focal, base);
  }
  return out;
}

function classes(factors: ArrayLike<number>, covered: number): { factor: number; slices: number[] }[] {
  const by = new Map<number, number[]>();
  for (let k = 0; k < covered; k++) {
    const list = by.get(factors[k]!) || [];
    list.push(k);
    by.set(factors[k]!, list);
  }
  return Array.from(by.keys()).sort((a, b) => a - b).map((factor) => ({ factor, slices: by.get(factor)! }));
}

// the factor whose lattice the row bands cut: the table's smallest over all its slices
function bandFactorOf(factors: ArrayLike<number>): number {
  let least = 255;
  for (let k = 0; k < factors.length; k++) {
    least = Math.min(least, factors[k]!);
  }
  return least;
}

function layoutOf(factors: ArrayLike<number>, covered: number, across: number, down: number, band?: { from: number; to: number; head: boolean }): { classes: { factor: number; ra: number; rd: number; slices: number[]; offset: number; length: number }[]; length: number } {
  let at = 0;
  const out: { factor: number; ra: number; rd: number; slices: number[]; offset: number; length: number }[] = [];
  const bandFactor = bandFactorOf(factors);
  classes(factors, covered).forEach((c) => {
    const isBand = band !== undefined && c.factor === bandFactor;
    if (band && !isBand && !band.head) {
      return;
    }
    const ra = FogAccum.reduced(across, c.factor), whole = FogAccum.reduced(down, c.factor), rd = isBand ? band!.to - band!.from : whole, length = c.slices.length * 2 * ra * rd * 4, entry = { factor: c.factor, ra, rd, slices: c.slices, offset: at, length };
    at += length;
    out.push(entry);
  });
  return { classes: out, length: at };
}

function bilinear(plane: ArrayLike<number>, ra: number, rd: number, sx: number, sy: number, jx: number, jy: number, X: number, Y: number, c: number): number {
  const u = Math.min(Math.max(X / sx - jx, 0), ra - 1), v = Math.min(Math.max(Y / sy - jy, 0), rd - 1);
  const x0 = Math.floor(u), y0 = Math.floor(v), x1 = Math.min(x0 + 1, ra - 1), y1 = Math.min(y0 + 1, rd - 1), fx = u - x0, fy = v - y0;
  const top = plane[(y0 * ra + x0) * 4 + c]! * (1 - fx) + plane[(y0 * ra + x1) * 4 + c]! * fx, bottom = plane[(y1 * ra + x0) * 4 + c]! * (1 - fx) + plane[(y1 * ra + x1) * 4 + c]! * fx;
  return top * (1 - fy) + bottom * fy;
}

export const BaseLodRes = { SPACING_M, MAX_STRIDE, RETIRED_STRIDE, spacing: SPACING_M, maxStride: MAX_STRIDE, strideOf, factorOf, table, classes, layoutOf, bandFactorOf, bilinear };

M.BaseLodRes = BaseLodRes;
