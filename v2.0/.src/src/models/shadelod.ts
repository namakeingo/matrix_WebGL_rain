// ShadeLod: the level of detail of the front shade grid by distance, as a pure model (no GL, no page, importable in any thread; Feature P1, story P10; units.ui.shadelod.ts).
// A cell of the grid holds the light through 8 m of cloud read at a noise mip of at least a 2 m spacing, so the data is smooth at a few metres, while a NEAR layer's cells are centimetres wide: the near layers are the over-resolved ones, the far layers
// (cells as wide as the detail) need all of theirs. Two savings on the quality pool path, each a flag of the fog (shadeLod, shadeLodRefresh):
// - RESOLUTION: the cells of an ABSOLUTE lattice (multiples of the stride in the grid's own indices, so cells baked at different times share it) are baked and the rest of the layer is filled by bilinear interpolation (separable: x, then y)
// - REFRESH: far draws are refreshed every 2nd, 4th or 8th sweep (the drift of the clouds against the cell), the sweep's rate scaled by the due fraction (models/quality/fogshade.ts: Schedule)
// Constants: SPACING_M = 0.5 (the lattice's spacing in metres where a layer's cells are narrower), MAX_STRIDE = 16.
// - cellWidth(layer) = 2 SPAN z / (ACROSS - 1), z = NEAR exp(layer / (DEEP - 1) LOG); strideX(layer) = clamp(floor(SPACING_M / cellWidth), 1, MAX_STRIDE)
// - rowSpacing(row) = 2 TOP row / (UP - 1)^2 (the rows are the square of the height: y = TOP (row / (UP - 1))^2); strideY(row) = clamp(floor(SPACING_M / rowSpacing), 1, MAX_STRIDE), row 0 the cap
// - colSamples(layer): the columns baked: 0, the stride, twice it ... and the last column; rowSamples(): the rows baked over the grid, walking from row 0 by strideY(row) (shortened to 0.5 m of height a gap), and the last row
// - cover(samples, from, count): the samples a box [from, from + count) needs: from the greatest sample at or before from to the smallest at or after from + count - 1
// - interp(samples, values, i): the linear interpolation of the sampled values at cell i (the first or last sample's value beyond them); spread(...): the separable interpolation of a box, the fast form of interp
// - period(layer, sweepS): every how many sweeps a layer is refreshed, the largest power of two to REFRESH_MOST with DRIFT_SPEED x 2 N sweepS <= REFRESH_FRACTION x the cell's least size (the layer's thickness or the width of a node of
//   the 64-column reduced grid: QualityFog's constants); drawPeriod(draw, layersPerDraw, sweepS): the shortest period among a draw's layers; dueFraction(periods): the mean of 1 / period
// - the reduced grid (the band worker's 64 x 32 x 48 nodes, a node every two cells): reducedStrideX(j) = max(1, floor(strideX(2 j + 1) / 2)) and reducedStrideY(r) = max(1, floor(strideY(2 r + 1) / 2)) (the deeper layer of the pair has
//   the smaller stride; the spacing stays 0.5 m); reducedColSamples(j), reducedRowSamples(), reducedFraction(j): the share of reduced layer j's nodes baked
//
// Changelog:
// 2026-11-24: new (Feature P1, story P10).
import { M } from "../engine/core";
import { QualityFog } from "./quality/fog";

const ACROSS = 128;
const UP = 64;
const DEEP = 96;
const TOP = 48;
const NEAR = 0.5;
const FAR = 300;
const SPAN = 1.0;
const LOG = Number(Math.log(FAR / NEAR).toFixed(6));
const SPACING_M = 0.5;
const MAX_STRIDE = 16;
// the reduced grid of the band worker (M.ShadeAccum.reducedGrid: every axis halved)
const RACROSS = ACROSS / 2;
const RUP = UP / 2;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function depth(layer: number): number {
  return NEAR * Math.exp((layer / (DEEP - 1)) * LOG);
}

function cellWidth(layer: number): number {
  return (2 * SPAN * depth(layer)) / (ACROSS - 1);
}

function rowSpacing(row: number): number {
  return (2 * TOP * row) / (UP - 1) / (UP - 1);
}

function strideOf(spacing: number): number {
  const n = Math.floor(SPACING_M / spacing);
  return n === n ? clamp(n, 1, MAX_STRIDE) : MAX_STRIDE;
}

function strideX(layer: number): number {
  return strideOf(cellWidth(layer));
}

function strideY(row: number): number {
  return strideOf(rowSpacing(row));
}

// the multiples of `stride` below n - 1, and n - 1
function lattice(n: number, stride: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n - 1; i += stride) {
    out.push(i);
  }
  out.push(n - 1);
  return out;
}

// the height (m) of a row of the grid (fractional rows too): the rows are the square root of the height
function heightOf(row: number): number {
  const g = Math.max(0, row) / (UP - 1);
  return g * g * TOP;
}

// the rows walked from row 0, the gap at each sample the stride there, shortened while it spans more than SPACING_M of height (the spacing of a row at the sample underestimates the span to the next one, the heights being the square of the row), and the last row
function walk(n: number, strideAt: (row: number) => number, heightAt: (row: number) => number): number[] {
  const out: number[] = [];
  let r = 0;
  while (r < n - 1) {
    out.push(r);
    let s = Math.max(1, strideAt(r));
    while (s > 1 && heightAt(r + s) - heightAt(r) > SPACING_M) {
      s--;
    }
    r += s;
  }
  out.push(n - 1);
  return out;
}

function colSamples(layer: number): number[] {
  return lattice(ACROSS, strideX(layer));
}

function rowSamples(): number[] {
  return walk(UP, strideY, heightOf);
}

function cover(samples: number[], from: number, count: number): number[] {
  const last = from + count - 1;
  let a = 0;
  while (a + 1 < samples.length && samples[a + 1]! <= from) {
    a++;
  }
  let b = samples.length - 1;
  while (b > 0 && samples[b - 1]! >= last) {
    b--;
  }
  return samples.slice(a, Math.max(a, b) + 1);
}

function interp(samples: number[], values: number[], i: number): number {
  const n = samples.length;
  if (i <= samples[0]!) {
    return values[0]!;
  }
  if (i >= samples[n - 1]!) {
    return values[n - 1]!;
  }
  let a = 0;
  while (samples[a + 1]! <= i) {
    a++;
  }
  const s0 = samples[a]!;
  const v0 = values[a]!;
  return v0 + (values[a + 1]! - v0) * ((i - s0) / (samples[a + 1]! - s0));
}

// per cell i of [from, from + count): the sample it is read from and the weight of the next one
function axisWeights(samples: number[], from: number, count: number, at: Int32Array, w: Float64Array): void {
  let a = 0;
  for (let n = 0; n < count; n++) {
    const i = from + n;
    while (a + 1 < samples.length && samples[a + 1]! <= i) {
      a++;
    }
    if (a + 1 >= samples.length || i <= samples[0]!) {
      at[n] = Math.min(a, samples.length - 1);
      w[n] = 0;
    } else {
      at[n] = a;
      w[n] = (i - samples[a]!) / (samples[a + 1]! - samples[a]!);
    }
  }
}

// The box [x0, x0 + nx) x [y0, y0 + rows) filled from the lattice values `vals` (floats, vals[(ri * cs.length + ci) * 2 + c] at row rs[ri], column cs[ci]) by the separable interpolation (x, then y); half pairs out[(y * nx + x) * 2 + c], the
// first row of the box first, rounded by `toHalf`. A lattice cell's own value comes back exactly (its weights are 0).
function spread(vals: ArrayLike<number>, cs: number[], rs: number[], x0: number, nx: number, y0: number, rows: number, out: Uint16Array, toHalf: (x: number) => number): void {
  const ax = new Int32Array(nx);
  const wx = new Float64Array(nx);
  const ay = new Int32Array(rows);
  const wy = new Float64Array(rows);
  axisWeights(cs, x0, nx, ax, wx);
  axisWeights(rs, y0, rows, ay, wy);
  const width = cs.length;
  let at = 0;
  for (let y = 0; y < rows; y++) {
    const ra = ay[y]! * width;
    const rb = Math.min(ay[y]! + 1, rs.length - 1) * width;
    const t = wy[y]!;
    for (let x = 0; x < nx; x++) {
      const c0 = ax[x]!;
      const c1 = Math.min(c0 + 1, width - 1);
      const s = wx[x]!;
      for (let c = 0; c < 2; c++) {
        const a0 = vals[(ra + c0) * 2 + c]!;
        const a = a0 + (vals[(ra + c1) * 2 + c]! - a0) * s;
        if (t === 0) {
          out[at++] = toHalf(a);
        } else {
          const b0 = vals[(rb + c0) * 2 + c]!;
          const b = b0 + (vals[(rb + c1) * 2 + c]! - b0) * s;
          out[at++] = toHalf(a + (b - a) * t);
        }
      }
    }
  }
}

// the least size (m) of layer l's cell: its thickness or the width of a node of the reduced grid's 64 columns
function leastSize(layer: number): number {
  const z = depth(layer);
  const thickness = z * (Math.exp(LOG / (DEEP - 1)) - 1);
  const width = (2 * SPAN * z) / (RACROSS - 1);
  return Math.min(thickness, width);
}

function period(layer: number, sweepS: number): number {
  const least = leastSize(layer);
  let n = 1;
  while (n * 2 <= QualityFog.REFRESH_MOST && QualityFog.DRIFT_SPEED * 2 * (n * 2) * sweepS <= QualityFog.REFRESH_FRACTION * least) {
    n *= 2;
  }
  return n;
}

function drawPeriod(draw: number, layersPerDraw: number, sweepS: number): number {
  let n = QualityFog.REFRESH_MOST;
  for (let l = draw * layersPerDraw; l < (draw + 1) * layersPerDraw && l < DEEP; l++) {
    n = Math.min(n, period(l, sweepS));
  }
  return n;
}

function dueFraction(periods: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < periods.length; i++) {
    sum += 1 / periods[i]!;
  }
  return periods.length > 0 ? sum / periods.length : 1;
}

function reducedStrideX(j: number): number {
  return Math.max(1, Math.floor(strideX(2 * j + 1) / 2));
}

function reducedStrideY(r: number): number {
  return Math.max(1, Math.floor(strideY(2 * r + 1) / 2));
}

function reducedColSamples(j: number): number[] {
  return lattice(RACROSS, reducedStrideX(j));
}

function reducedRowSamples(): number[] {
  return walk(RUP, reducedStrideY, (r) => heightOf(2 * r - 0.5));
}

function reducedFraction(j: number): number {
  return (reducedColSamples(j).length / RACROSS) * (reducedRowSamples().length / RUP);
}

export const ShadeLod = { SPACING_M, MAX_STRIDE, cellWidth, rowSpacing, strideX, strideY, lattice, colSamples, rowSamples, cover, interp, spread, period, drawPeriod, dueFraction, reducedStrideX, reducedStrideY, reducedColSamples, reducedRowSamples, reducedFraction };

M.ShadeLod = ShadeLod;
