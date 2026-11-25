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
// - plan(on, view, focal) and counts(view, focal) are made from a TABLE: the count of a column is a function of the ray's slope dy alone for a given eye height, base strength, air, focal (the resolvable distance) and water, so the dy at which the
//   ray's end reaches each slice start is found once (a bisection on dy of the closed-form test air b + depth(dy, b) <= ln(1 / TAIL_T), the mirrored ray with its own depth, the water's own cut kept exact per point), cached by those five inputs, and
//   every point's count is a binary search over it; the table is checked against the exact count at 200 slopes and a branch that fails it (or is not monotone) counts exactly per point. planSlow and countsSlow are the earlier
//   implementation, kept as the oracle of the tests; stats.depthCalls counts the closed-form depth's evaluations of both, stats.tables the tables built.
//
// Changelog:
// 2026-11-24: retired(k, focal), firstFlat(focal) (the flat slices, a tail of the volume: retired after an accumulation's first frame) and cutChanged(previous, next) (the cut layer's counts).
// 2026-11-24: the mirrored ray's table in two: a ray that meets the water inside the resolvable distance (slope <= -eye / R) gets less dense the steeper it is (the count falls as the slope rises), one that meets it beyond it the other way
//   (the count rises with the slope: the layer's depth starts at the water): a V with its foot at slope -eye / R, so each side has its own monotone table (the first over the steepness -slope).
// 2026-11-24: plan and counts from a cached threshold table over dy (planSlow, countsSlow: the earlier implementation; stats).
// 2026-11-22: new (Feature U3, story M5).
// 2026-11-22: level: flat only where the amplitude is 0 (the strength rule is gone: it made the near slices flat at low Fog intensity, which changed the volume).
import { M } from "../engine/core";
import { BaseMist } from "../engine/basemist";
import { QualityFog } from "./quality/fog";
import type { FogQualityView } from "./quality/fog";
import { StaticMist } from "./staticmist";

const LEVELS = 40;

// the evaluations of the closed-form depth (by the earlier implementation and the table's builds) and the tables built (the tests read their differences)
const stats = { depthCalls: 0, tables: 0 };

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
    return reach(air, target, R, (a) => {
      stats.depthCalls++;
      return a > R ? StaticMist.baseDepth(base, BaseMist.HB, eye, dy, R, a) : 0;
    });
  }
  const hit = eye / -dy, from = Math.max(hit, R);
  return reach(air, target, from, (a) => {
    stats.depthCalls++;
    return a > from ? StaticMist.baseDepth(base, BaseMist.HB, -eye, -dy, from, a) : 0;
  });
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

function countsSlow(view: FogQualityView, focal: number): { columns: number; full: number; cells: number; culledColumns: number; flatSlices: number } {
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

function planSlow(on: boolean, view: FogQualityView, focal: number): { slices: Uint16Array; levels: Uint8Array } {
  const slices = new Uint16Array(view.across * view.down).fill(BaseMist.SLICES), levels = new Uint8Array(BaseMist.SLICES).fill(LEVELS);
  if (!on) return { slices, levels };
  const ends = columnEnds(view, focal);
  for (let c = 0; c < ends.length; c++) slices[c] = slicesTo(ends[c]!);
  for (let k = 0; k < BaseMist.SLICES; k++) levels[k] = level(k, focal);
  return { slices, levels };
}

// ---- the table: the count of a column from its ray's slope ----
interface Table {
  // t[k]: the least slope at which slice k's start is within the ray's end (-Infinity: at every slope, +Infinity: at none); t[0] = -Infinity; nondecreasing
  t: Float64Array;
  // the table failed its check: its branch counts exactly (a binary search of the closed-form test) per point
  exact: boolean;
  // the table is over the steepness -slope (the count rises with it) instead of the slope
  flip: boolean;
}

interface Tables {
  key: string;
  direct: Table;
  // the mirrored ray: steep (the slope at most `foot`: the water is met within the resolvable distance) and shallow sides, null without water or when a side is empty; foot = -eye / R clamped to the slopes the mirror covers
  steep: Table | null;
  shallow: Table | null;
  foot: number;
  water: boolean;
  eye: number;
  below: number;
  cutSlack: number;
  testDirect: (b: number, dy: number) => boolean;
  testMirror: (b: number, dy: number) => boolean;
}

const BISECT = 36;
const CHECKS = 100;
let startsMade: Float64Array | null = null;
let cache: Tables | null = null;
let scratch = new Uint16Array(0);

// the slices' starts (made at first use: BaseMist is not defined while the modules are being loaded)
function starts(): Float64Array {
  if (startsMade === null) {
    startsMade = new Float64Array(BaseMist.SLICES);
    for (let k = 0; k < BaseMist.SLICES; k++) startsMade[k] = BaseMist.sliceStart(k);
  }
  return startsMade;
}

// the number of slices whose start is within `end`
function startsWithin(end: number): number {
  const st = starts();
  let lo = 0, hi = st.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (st[mid]! <= end) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// the count by the closed-form test itself (the test is true for the first slices and false from some slice on: a binary search)
function exactCount(test: (b: number, dy: number) => boolean, dy: number): number {
  const st = starts();
  let lo = 1, hi = st.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (test(st[mid]!, dy)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function tableCount(table: Table, dy: number): number {
  const t = table.t;
  let lo = 0, hi = t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid]! <= dy) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// the table of a test over the slopes from `from` to `to` (the test true at `to` and from some slope on, or, with `flip`, true at `from` and below some slope: the table is then over the steepness -slope), checked against the exact count at
// CHECKS slopes spread over them (denser near the true end)
function buildTable(test: (b: number, dy: number) => boolean, from: number, to: number, flip: boolean): Table {
  const st = starts(), t = new Float64Array(st.length), at = (x: number): number => (flip ? -x : x);
  const lo0 = flip ? -to : from, hi0 = flip ? -from : to, probe = (b: number, x: number): boolean => test(b, at(x));
  t[0] = -Infinity;
  let sorted = true;
  for (let k = 1; k < st.length; k++) {
    const b = st[k]!;
    if (!probe(b, hi0)) t[k] = Infinity;
    else if (probe(b, lo0)) t[k] = -Infinity;
    else {
      let a = lo0, z = hi0;
      for (let i = 0; i < BISECT; i++) {
        const mid = 0.5 * (a + z);
        if (probe(b, mid)) z = mid;
        else a = mid;
      }
      t[k] = z;
    }
    if (t[k]! < t[k - 1]!) sorted = false;
  }
  const table: Table = { t, exact: !sorted, flip };
  if (!table.exact) {
    for (let j = 0; j < CHECKS; j++) {
      const u = (j + 0.5) / CHECKS, x = lo0 + (hi0 - lo0) * (1 - (1 - u) * (1 - u));
      if (tableCount(table, x) !== exactCount(test, at(x))) {
        table.exact = true;
        break;
      }
    }
  }
  return table;
}

function tablesFor(view: FogQualityView, focal: number): Tables {
  const i = view.inputs, base = i.mist || 0, air = i.air, eye = i.eyeY, R = StaticMist.resolvableDistance(focal), target = Math.log(1 / QualityFog.TAIL_T), water = !!i.waterDrawn;
  const key = [eye, base, air, R, water].join(",");
  if (cache !== null && cache.key === key) return cache;
  const testDirect = (b: number, dy: number): boolean => {
    stats.depthCalls++;
    return air * b + (b > R ? StaticMist.baseDepth(base, BaseMist.HB, eye, dy, R, b) : 0) <= target;
  };
  const testMirror = (b: number, dy: number): boolean => {
    stats.depthCalls++;
    const from = Math.max(eye / -dy, R);
    return air * b + (b > from ? StaticMist.baseDepth(base, BaseMist.HB, -eye, -dy, from, b) : 0) <= target;
  };
  stats.tables++;
  // (the mirrored ray's foot: the slope at which it meets the water exactly at the resolvable distance)
  const foot = Math.min(-1e-6, Math.max(-1, -eye / R));
  cache = {
    key, direct: buildTable(testDirect, -1, 1, false), water, eye, below: QualityFog.CULL_BELOW, cutSlack: QualityFog.CULL_RELATIVE, testDirect, testMirror, foot,
    steep: water && foot > -1 ? buildTable(testMirror, -1, foot, true) : null,
    shallow: water && foot < -1e-6 ? buildTable(testMirror, foot, -1e-6, false) : null,
  };
  return cache;
}

// the count of the ray of slope dy: the earlier pointEnd's slices
function pointCount(c: Tables, dy: number): number {
  if (c.water && dy < -1e-6) {
    const cut = startsWithin(((c.eye + c.below) / -dy) * (1 + c.cutSlack)), m = dy <= c.foot ? c.steep : c.shallow;
    return Math.max(cut, m === null || m.exact ? exactCount(c.testMirror, dy) : tableCount(m, m.flip ? -dy : dy));
  }
  return c.direct.exact ? exactCount(c.testDirect, dy) : tableCount(c.direct, dy);
}

// every column's slice count: the largest count of its 3 x 3 points (one more ring around the volume)
function columnCounts(view: FogQualityView, focal: number): Uint16Array {
  const c = tablesFor(view, focal), w = view.across + 2, h = view.down + 2, out = new Uint16Array(view.across * view.down);
  if (scratch.length < w * h) scratch = new Uint16Array(w * h);
  const points = scratch;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) points[y * w + x] = pointCount(c, QualityFog.columnDy(view, x - 1, y - 1));
  for (let y = 0; y < view.down; y++) {
    for (let x = 0; x < view.across; x++) {
      let n = 0;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) n = Math.max(n, points[(y + j) * w + x + i]!);
      out[y * view.across + x] = n;
    }
  }
  return out;
}

function plan(on: boolean, view: FogQualityView, focal: number): { slices: Uint16Array; levels: Uint8Array } {
  const levels = new Uint8Array(BaseMist.SLICES).fill(LEVELS);
  if (!on) return { slices: new Uint16Array(view.across * view.down).fill(BaseMist.SLICES), levels };
  for (let k = 0; k < BaseMist.SLICES; k++) levels[k] = level(k, focal);
  return { slices: columnCounts(view, focal), levels };
}

function counts(view: FogQualityView, focal: number): { columns: number; full: number; cells: number; culledColumns: number; flatSlices: number } {
  const columns = view.across * view.down, slices = columnCounts(view, focal);
  let cells = 0, culled = 0;
  for (let c = 0; c < slices.length; c++) {
    cells += slices[c]!;
    if (slices[c]! < BaseMist.SLICES) culled++;
  }
  return { columns, full: columns * BaseMist.SLICES, cells, culledColumns: culled, flatSlices: flatSlices(focal) };
}

// whether slice k is flat (the density the closed form: the accumulation needs no more than its first frame) and the least such slice (SLICES when none): the flat slices are the tail past the resolvable distance
function retired(k: number, focal: number): boolean {
  return level(k, focal) === 0;
}

function firstFlat(focal: number): number {
  let k = BaseMist.SLICES;
  while (k > 0 && retired(k - 1, focal)) k--;
  return k;
}

// whether the cut layer's counts are not the ones last written (nothing written: changed)
function cutChanged(previous: ArrayLike<number> | null, next: ArrayLike<number>): boolean {
  if (previous === null || previous.length !== next.length) return true;
  for (let i = 0; i < next.length; i++) if (previous[i] !== next[i]) return true;
  return false;
}

export const BaseLod = { LEVELS, sliceMid, level, denseEnd, columnLimit, slicesOf, counts, plan, countsSlow, planSlow, stats, retired, firstFlat, cutChanged };

M.BaseLod = BaseLod;
