// QualityFog: the fog's adapter for the quality model, pure: no GL, no page, runs in any thread. The units are the fog's
// volume's slices (SLICES of them along each column's ray, from SLICE_NEAR on, thin near the eye, to FOG_FAR).
// What is read of the eye's volume (direct): with the water drawn, every pixel below the horizon stops at the still water
// (y = 0): the water reads the volume at its hit distance, the characters, splashes and bolt (all above the water, never
// below the plane CULL_BELOW under it) at distances before the ray meets that plane. So along a column's ray going down,
// the direct slices that start past the plane are read by nothing. The volume is read trilinearly, between two columns
// each way, and the reading pixel's ray is between the rays of its columns, so a column holds a slice only when the slice
// starts past the plane's distance along every ray of its 3 x 3 neighbours (columnCut: the largest of the nine: a
// neighbour at or above the horizon has none, Infinity), by the relative slack CULL_RELATIVE (the 32 bit rays, the slice
// bounds' rounding). The mirrored volume, the strikes' own use of the plane and every column of the sky are never held.
// A slice's level is QUALITY_LEVELS when no column holds it, else 1 to QUALITY_LEVELS - 1 by the share of the columns
// that gather it (never 0: the mirrored volume is read there). The shader's own test (shaders/fog/slice.glsl,
// directHeld) is this rule on the same rays; the job only says which slices need the test at all, from a sample of the
// columns, so a column missed by the sample costs a held slice, never a wrong picture.
// The columns' rays: the camera has a pitch and no roll, forward = (0, sin p, -cos p), right = (1, 0, 0), up = (0, cos p,
// sin p), so a ray's y is (sin p + v cos p) / sqrt(1 + u^2 + v^2), u and v the place's offset from the screen's middle over
// the focal length. The job keeps a table of the sampled columns' cuts for the view it was last made for (a static
// camera costs nothing a frame); a range of slices gives the whole's levels.
//
// Level of detail (three savings, each bounded; the constants are the anchors):
// - The dense tail: a column holds a slice (its direct gather skipped, its sums carried on: the value at the slice's start, kept)
//   when its own ray's transmittance bound at the slice's start is under TAIL_T. The transmittance along a ray is at most
//   exp(-(air + DENSITY_FLOOR sigma e^(-yHigh / H)) t), yHigh the ray's highest point, an end of the straight line (unit.ts:
//   transmittance). What is lost past a slice start a is its light (at most T(a) times the radiance a slice adds) and the
//   transmittance's remainder (at most T(a) times the radiance behind the fog), both at most T(a) TAIL_RADIANCE; the picture's
//   pixel is that times the exposure's largest gain (TAIL_EXPOSURE) times the tone curve's steepest slope (TAIL_SLOPE,
//   srgb(aces(x)): 6.39 at x = 0.0087, the HDR lift's slope 0.5): under 1/255 when T(a) < TAIL_T. It is a test of the slice's
//   start alone, so no contiguity is needed. TAIL_RADIANCE covers the bolt's drawn light (twice BOLT_PEAK, 6.3) and the fog's own
//   (the sky's and moon's light times the albedo: under 0.1 at the defaults, under 2 at the brightest setting); the strikes'
//   scattered light per slice is that times its emitter's irradiance, which the line emitter's 1 / d^2 does not bound near the
//   bolt: a bolt inside dense fog is lit mostly by what the nearer slices keep. The shader tests each column (directHeld);
//   the job only says which slices need the test, from the sampled columns going down (a ray at or under the horizon has its
//   highest point at the eye: denseStart), so a column missed costs a held slice, never a wrong picture. The same table holds
//   the water's cut, and a slice's level is the share of the sampled columns that hold it by either.
// - The refresh by distance: the clouds drift at most DRIFT_SPEED (the fastest noise layer: 24 m x (0.004, 0.0016) per second),
//   so a slice refreshed every N sweeps (SWEEP_SECONDS each) is stale by at most N sweeps: N is the largest power of two, at most
//   REFRESH_MOST, with DRIFT_SPEED N SWEEP_SECONDS <= REFRESH_FRACTION of the froxel's least size there (the slice's thickness or
//   the column's width at its middle). Depends only on the view, never on the strikes (their light is gathered on its own).
// - The gather's far octaves: the noise is read at the mip of the froxel's footprint (sliceFootprint, the shader's lodOf); an
//   octave of period `size` m is at the top mip (its texture's mean) once the footprint is the period: flatOctaves counts the
//   octaves (24, 10 and 4 m) the gather replaces by their mean 0.5 (the texture's mean differs by under 0.01: under 2% of the
//   density's scale).
//
// Changelog:
// 2026-11-07: Lod: the physical level of a slice (transmittance), the refresh and the octaves by level, whole slices held, the strikes' skip.
// 2026-11-07: level of detail: the dense tail (level 0), the refresh periods and the far octaves.
// 2026-11-06: new; the pool's job kind "fog" registered.
import { M } from "../../engine/core";
import { QualityJobs } from "./jobs";
import { QUALITY_LEVELS } from "./types";

// the volume's slices and the distances they span (m); the effect's shaders are made with these
const SLICES = 96;
const SLICE_NEAR = 1;
const FOG_FAR = 300;
const SLICE_LOG = Math.log(1 + FOG_FAR / SLICE_NEAR);
// how far under the water (m) a thing read through the volume can be: the plane the cut is taken to
const CULL_BELOW = 0.5;
// the share a slice's start must be past the cut by
const CULL_RELATIVE = 0.001;
// the least ray's way down (y) that has a cut
const DOWN_MIN = 1e-6;
// the sampled columns of the job: about SAMPLE_ACROSS across and as many down
const SAMPLE_ACROSS = 48;

// the dense tail's bound: the brightest radiance seen behind the fog or added by a slice (HDR), the exposure's largest gain
// (Exposure.gain at 100: 2 ^ ((100 - 50) / 25)) and the tone curve's steepest slope
const TAIL_RADIANCE = 16;
const TAIL_EXPOSURE = 4;
const TAIL_SLOPE = 6.4;
const TAIL_T = 1 / 255 / (TAIL_RADIANCE * TAIL_EXPOSURE * TAIL_SLOPE);
// the clouds' density floor and scale height (unit.ts's, shaders/fog/medium.glsl)
const DENSITY_FLOOR = 0.2;
const DENSITY_HEIGHT = 4;
// the clouds' fastest drift (m/s), the time of a sweep of the volume (s), the share of a froxel the drift may cover between
// two refreshes of a slice, and the most sweeps between them
const DRIFT_SPEED = 24 * Math.hypot(0.004, 0.0016);
const SWEEP_SECONDS = 1 / 6;
const REFRESH_FRACTION = 0.25;
const REFRESH_MOST = 8;
// the noise's octaves (m), its texels and its top mip (log2 of them)
const OCTAVE_SIZES = [24, 10, 4];
const NOISE_TEXELS = 128;
const TOP_MIP = 7;

// the view a job is made for: the shared inputs' eye, focal and screen, the water, and the volume's columns
export interface FogQualityView {
  inputs: { eyeY: number; focal: number; width: number; height: number; waterDrawn: boolean; sigma: number; air: number };
  pitch: number;
  margin: number;
  across: number;
  down: number;
}

// the start of slice k (m): the shader's sliceAt(k / SLICES)
function sliceStart(k: number): number {
  return SLICE_NEAR * (Math.exp((k / SLICES) * SLICE_LOG) - 1);
}

function bounds(): Float32Array {
  const b = new Float32Array(SLICES + 1);
  for (let k = 0; k <= SLICES; k++) b[k] = sliceStart(k);
  return b;
}

// the y of the eye's ray through column (ix, iy)'s middle (the shader's columnRay at gl_FragCoord = the column + 0.5; the volume
// reaches `margin` of the screen past each side), a column past the volume's edge included
function columnDy(view: FogQualityView, ix: number, iy: number): number {
  return rayY(view, Math.sin(view.pitch), Math.cos(view.pitch), ix, iy);
}

// columnDy with the pitch's sine and cosine given
function rayY(view: FogQualityView, sin: number, cos: number, ix: number, iy: number): number {
  const i = view.inputs;
  const x = (((ix + 0.5) / view.across) * (1 + 2 * view.margin) - view.margin) * i.width;
  const y = (((iy + 0.5) / view.down) * (1 + 2 * view.margin) - view.margin) * i.height;
  const u = (x - i.width * 0.5) / i.focal;
  const v = (y - i.height * 0.5) / i.focal;
  return (sin + v * cos) / Math.sqrt(1 + u * u + v * v);
}

// the distance along the ray of a column to the plane CULL_BELOW under the water (Infinity: it does not go down)
function underWater(view: FogQualityView, sin: number, cos: number, ix: number, iy: number): number {
  const dy = rayY(view, sin, cos, ix, iy);
  return dy < -DOWN_MIN ? (view.inputs.eyeY + CULL_BELOW) / -dy : Infinity;
}

// the distance past which nothing reads the column's direct volume: the largest of the plane's distances along the rays of
// the column and its eight neighbours (Infinity with the water not drawn, or when any of them is not going down)
function columnCut(view: FogQualityView, ix: number, iy: number): number {
  return cutOf(view, Math.sin(view.pitch), Math.cos(view.pitch), ix, iy);
}

// columnCut with the pitch's sine and cosine given
function cutOf(view: FogQualityView, sin: number, cos: number, ix: number, iy: number): number {
  if (!view.inputs.waterDrawn) {
    return Infinity;
  }
  let far = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const t = underWater(view, sin, cos, ix + i, iy + j);
      if (t > far) far = t;
    }
  }
  return far;
}

// whether a slice starting at `a` is read by nothing in the column
function unread(view: FogQualityView, ix: number, iy: number, a: number): boolean {
  return a > columnCut(view, ix, iy) * (1 + CULL_RELATIVE);
}

// an upper bound of the transmittance from the eye to distance a along a ray rising dy per unit of direction: the clouds at their
// least dense on the way (the density's floor at the ray's highest point) and the air
function tailBound(view: FogQualityView, dy: number, a: number): number {
  const i = view.inputs;
  const yHigh = i.eyeY + (dy > 0 ? dy * a : 0);
  const clouds = i.sigma > 0 ? DENSITY_FLOOR * i.sigma * Math.exp(-(yHigh > 0 ? yHigh : 0) / DENSITY_HEIGHT) : 0;
  return Math.exp(-(i.air + clouds) * a);
}

// the distance past which a ray going down (dy <= 0: its highest point the eye) is dense: its bound is under TAIL_T. Infinity for
// a rising ray (its bound is found slice by slice, tailBound) and where there are no clouds nor air to take light away
function denseStart(view: FogQualityView, dy: number): number {
  const i = view.inputs;
  if (dy > 0) {
    return Infinity;
  }
  const clouds = i.sigma > 0 ? DENSITY_FLOOR * i.sigma * Math.exp(-(i.eyeY > 0 ? i.eyeY : 0) / DENSITY_HEIGHT) : 0;
  const extinction = i.air + clouds;
  return extinction > 0 ? Math.log(1 / TAIL_T) / extinction : Infinity;
}

// whether column (ix, iy) holds the slice starting at a for its density: its own ray's bound is under TAIL_T there
function denseHeld(view: FogQualityView, ix: number, iy: number, a: number): boolean {
  return tailBound(view, columnDy(view, ix, iy), a) < TAIL_T;
}

// the width of a column at the middle of slice k (m)
function columnWidth(view: FogQualityView, k: number): number {
  const i = view.inputs;
  return (0.5 * (sliceStart(k) + sliceStart(k + 1)) * ((i.width * (1 + 2 * view.margin)) / view.across)) / i.focal;
}

// the size of slice k's froxel (m) as the noise's reading takes it: its thickness or the column's width, the larger (the shader's
// sliceLod)
function sliceFootprint(view: FogQualityView, k: number): number {
  const thickness = sliceStart(k + 1) - sliceStart(k);
  const width = columnWidth(view, k);
  return width > thickness ? width : thickness;
}

// every how many sweeps slice k is refreshed: the largest power of two (to REFRESH_MOST) that keeps the clouds' drift between two
// refreshes under REFRESH_FRACTION of the froxel's least size
function refreshEvery(view: FogQualityView, k: number): number {
  const thickness = sliceStart(k + 1) - sliceStart(k);
  const width = columnWidth(view, k);
  const least = width < thickness ? width : thickness;
  let n = 1;
  while (n * 2 <= REFRESH_MOST && DRIFT_SPEED * 2 * n * SWEEP_SECONDS <= REFRESH_FRACTION * least) n *= 2;
  return n;
}

// how many of the noise's octaves slice k's gather reads as their mean: those whose period is within the froxel's footprint
function flatOctaves(view: FogQualityView, k: number): number {
  const metres = sliceFootprint(view, k);
  let flat = 0;
  for (const size of OCTAVE_SIZES) {
    if (Math.log2(metres * NOISE_TEXELS) - Math.log2(size) >= TOP_MIP - 1e-9) flat++;
  }
  return flat;
}

// the table kept for a view: the sampled columns' cuts (times 1 + CULL_RELATIVE), sorted
const TABLE_MOST = (SAMPLE_ACROSS + 2) * (SAMPLE_ACROSS + 2) * 4;
const CUTS = new Float64Array(TABLE_MOST);
const KEY = { eyeY: NaN, focal: NaN, width: NaN, height: NaN, waterDrawn: false, sigma: NaN, air: NaN, pitch: NaN, margin: NaN, across: -1, down: -1, count: 0, samples: 1 };

function sameView(view: FogQualityView): boolean {
  const i = view.inputs;
  return KEY.eyeY === i.eyeY && KEY.focal === i.focal && KEY.width === i.width && KEY.height === i.height && KEY.waterDrawn === i.waterDrawn && KEY.sigma === i.sigma && KEY.air === i.air && KEY.pitch === view.pitch && KEY.margin === view.margin && KEY.across === view.across && KEY.down === view.down;
}

function remember(view: FogQualityView): void {
  const i = view.inputs;
  KEY.eyeY = i.eyeY;
  KEY.focal = i.focal;
  KEY.width = i.width;
  KEY.height = i.height;
  KEY.waterDrawn = i.waterDrawn;
  KEY.sigma = i.sigma;
  KEY.air = i.air;
  KEY.pitch = view.pitch;
  KEY.margin = view.margin;
  KEY.across = view.across;
  KEY.down = view.down;
}

// makes the table for a view: the distances past which a column holds a slice (the water's cut with its slack, the density's start, the
// nearer) on a coarse grid of columns (both edges included), the finite ones sorted
function makeTable(view: FogQualityView): void {
  remember(view);
  let count = 0;
  if (view.inputs.waterDrawn || view.inputs.sigma > 0) {
    const sin = Math.sin(view.pitch), cos = Math.cos(view.pitch);
    const stepX = Math.max(1, Math.ceil(view.across / SAMPLE_ACROSS));
    const stepY = Math.max(1, Math.ceil(view.down / SAMPLE_ACROSS));
    for (let iy = 0; iy < view.down + stepY - 1; iy += stepY) {
      const y = Math.min(iy, view.down - 1);
      for (let ix = 0; ix < view.across + stepX - 1; ix += stepX) {
        const cx = Math.min(ix, view.across - 1);
        let cut = cutOf(view, sin, cos, cx, y) * (1 + CULL_RELATIVE);
        const dense = denseStart(view, rayY(view, sin, cos, cx, y));
        if (dense < cut) cut = dense;
        if (cut !== Infinity && count < TABLE_MOST) {
          CUTS[count++] = cut;
        }
      }
    }
    CUTS.subarray(0, count).sort();
  }
  KEY.count = count;
  KEY.samples = sampleCount(view);
}

// the sampled columns of a view (the finite and the infinite ones: the share's divisor)
function sampleCount(view: FogQualityView): number {
  const stepX = Math.max(1, Math.ceil(view.across / SAMPLE_ACROSS));
  const stepY = Math.max(1, Math.ceil(view.down / SAMPLE_ACROSS));
  return Math.ceil((view.down + stepY - 1) / stepY) * Math.ceil((view.across + stepX - 1) / stepX);
}

// the number of the table's cuts under `a`
function below(a: number): number {
  let lo = 0, hi = KEY.count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (CUTS[mid] < a) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// the levels of the slices from..to-1 into out: QUALITY_LEVELS where no sampled column holds the slice, else by the share that
// gather it, at most QUALITY_LEVELS - 1 and at least 1
function process(statics: Record<string, Float32Array>, view: FogQualityView, from: number, to: number, out: Uint8Array): void {
  if (!sameView(view)) {
    makeTable(view);
  }
  const starts = statics.bounds;
  for (let k = from; k < to; k++) {
    const held = KEY.count === 0 ? 0 : below(starts[k]);
    if (held === 0) {
      out[k] = QUALITY_LEVELS;
    } else {
      const level = Math.ceil(QUALITY_LEVELS * (1 - held / KEY.samples));
      out[k] = level < 1 ? 1 : level > QUALITY_LEVELS - 1 ? QUALITY_LEVELS - 1 : level;
    }
  }
}

// ---- The level-by-level level of detail (Lod) ----
// A slice's physical level: q = the largest transmittance bound of the eye's rays to the slice's start over every column of the volume
// (tailBound at the highest ray), level = ceil(40 q), 0 when q is under TAIL_T (every column holds the slice by density). What a change of
// a froxel's density loses (a stale volume, an octave read as its mean, a strike's light left out) reaches the picture times the
// transmittance (T <= level / 40), so at level L the froxel's optical depth may change by TAIL_T x 40 / L (TAIL_T holds the radiance,
// exposure and tone slope's share: 1 / 255 over their product). The tables and functions below are pure and equal in any split.
const LEVEL_REFRESH_MOST = 32;
const OCTAVE_WEIGHTS = [0.55, 0.3, 0.15];
// the density's change per unit of change of the noise: 0.8 x smoothstep's steepest slope 7.5
const DENSITY_SLOPE = 6;
// the Henyey-Greenstein phase's largest value (forward, g = PHASE_G of materials/fog.ts, 0.2)
const PHASE_G = 0.2;
const STRIKE_PHASE_MAX = (1 - PHASE_G * PHASE_G) / Math.pow(1 - PHASE_G, 3) / (4 * Math.PI);

// the 41 entries of the share of a froxel the clouds' drift may cover between two refreshes of a slice, by level: the by-distance
// fraction at level 40, growing as 40 / level (the error is the transmittance's share of it) up to a whole froxel; level 0 a whole one
function fractionTable(): Float32Array {
  const t = new Float32Array(QUALITY_LEVELS + 1);
  t[0] = 1;
  for (let level = 1; level <= QUALITY_LEVELS; level++) t[level] = Math.min(1, (REFRESH_FRACTION * QUALITY_LEVELS) / level);
  return t;
}
const FRACTIONS = fractionTable();

// the geometry of a view's columns, the whole grid scanned once for a view: the highest ray (dyMax), the highest ray among the columns
// with no cut by the water (dyFree, -Infinity: none) and the distance past which the columns with a cut are all held (heldFrom, 0:
// none), by the water's cut with its slack or density, whichever is first
const LKEY = { eyeY: NaN, focal: NaN, width: NaN, height: NaN, waterDrawn: false, sigma: NaN, air: NaN, pitch: NaN, margin: NaN, across: -1, down: -1, dyMax: -Infinity, dyFree: -Infinity, heldFrom: 0 };
let DYS = new Float64Array(0);

function lodSame(view: FogQualityView): boolean {
  const i = view.inputs;
  return LKEY.eyeY === i.eyeY && LKEY.focal === i.focal && LKEY.width === i.width && LKEY.height === i.height && LKEY.waterDrawn === i.waterDrawn && LKEY.sigma === i.sigma && LKEY.air === i.air && LKEY.pitch === view.pitch && LKEY.margin === view.margin && LKEY.across === view.across && LKEY.down === view.down;
}

function lodScan(view: FogQualityView): void {
  if (lodSame(view)) {
    return;
  }
  const i = view.inputs;
  LKEY.eyeY = i.eyeY;
  LKEY.focal = i.focal;
  LKEY.width = i.width;
  LKEY.height = i.height;
  LKEY.waterDrawn = i.waterDrawn;
  LKEY.sigma = i.sigma;
  LKEY.air = i.air;
  LKEY.pitch = view.pitch;
  LKEY.margin = view.margin;
  LKEY.across = view.across;
  LKEY.down = view.down;
  const sin = Math.sin(view.pitch), cos = Math.cos(view.pitch);
  const w = view.across + 2;
  const need = w * (view.down + 2);
  if (DYS.length < need) {
    DYS = new Float64Array(need);
  }
  for (let iy = -1; iy <= view.down; iy++) {
    for (let ix = -1; ix <= view.across; ix++) {
      DYS[(iy + 1) * w + ix + 1] = rayY(view, sin, cos, ix, iy);
    }
  }
  const eye = i.eyeY + CULL_BELOW;
  let dyMax = -Infinity, dyFree = -Infinity, heldFrom = 0;
  for (let iy = 0; iy < view.down; iy++) {
    for (let ix = 0; ix < view.across; ix++) {
      const own = DYS[(iy + 1) * w + ix + 1]!;
      if (own > dyMax) dyMax = own;
      let far = 0;
      if (!i.waterDrawn) {
        far = Infinity;
      } else {
        for (let j = 0; j < 3 && far !== Infinity; j++) {
          for (let n = 0; n < 3; n++) {
            const dy = DYS[(iy + j) * w + ix + n]!;
            const t = dy < -DOWN_MIN ? eye / -dy : Infinity;
            if (t > far) far = t;
          }
        }
      }
      if (far === Infinity) {
        if (own > dyFree) dyFree = own;
      } else {
        let from = far * (1 + CULL_RELATIVE);
        const dense = denseStart(view, own);
        if (dense < from) from = dense;
        if (from > heldFrom) heldFrom = from;
      }
    }
  }
  LKEY.dyMax = dyMax;
  LKEY.dyFree = dyFree;
  LKEY.heldFrom = heldFrom;
}

// the largest transmittance bound over every column at the start of slice k
function sliceTransmittance(view: FogQualityView, k: number): number {
  lodScan(view);
  return tailBound(view, LKEY.dyMax, sliceStart(k));
}

function levelOf(t: number): number {
  if (t < TAIL_T) return 0;
  const level = Math.ceil(QUALITY_LEVELS * t - 1e-9);
  return level < 1 ? 1 : level > QUALITY_LEVELS ? QUALITY_LEVELS : level;
}

// slice k's level (0 to QUALITY_LEVELS)
function sliceLevel(view: FogQualityView, k: number): number {
  return levelOf(sliceTransmittance(view, k));
}

// the level of column (ix, iy)'s own ray at slice k
function columnLevel(view: FogQualityView, ix: number, iy: number, k: number): number {
  return levelOf(tailBound(view, columnDy(view, ix, iy), sliceStart(k)));
}

// whether every column of the volume holds slice k's direct gather: the columns with a cut by the water are past it or dense, the
// others dense by their own rays
function sliceHeld(view: FogQualityView, k: number): boolean {
  lodScan(view);
  const a = sliceStart(k);
  if (LKEY.heldFrom > 0 && !(a > LKEY.heldFrom)) {
    return false;
  }
  return LKEY.dyFree === -Infinity || tailBound(view, LKEY.dyFree, a) < TAIL_T;
}

// the most sweeps between two refreshes of slice k at `level`: the largest power of two (to the level's most) that keeps the drift
// within the level's fraction of the froxel's least size. The most is the by-distance REFRESH_MOST at level 40, growing as 40 / level
// up to LEVEL_REFRESH_MOST. 0 at level 0 (the slice is held: never refreshed)
function levelRefresh(view: FogQualityView, k: number, level: number): number {
  if (level <= 0) {
    return 0;
  }
  const thickness = sliceStart(k + 1) - sliceStart(k);
  const width = columnWidth(view, k);
  const least = width < thickness ? width : thickness;
  const fraction = FRACTIONS[level > QUALITY_LEVELS ? QUALITY_LEVELS : level]!;
  let most = 1;
  while (most * 2 <= LEVEL_REFRESH_MOST && most * 2 <= (REFRESH_MOST * QUALITY_LEVELS) / level) most *= 2;
  let n = 1;
  while (n * 2 <= most && DRIFT_SPEED * 2 * n * SWEEP_SECONDS <= fraction * least) n *= 2;
  return n;
}

// how many of the noise's octaves (finest first: 4 m, 10 m, 24 m) slice k's gather reads as their mean at `level`: those the footprint
// flattens (flatOctaves, free), then as many more as keep the density's change of optical depth (each one 6 x 0.5 x weight x sigma x
// thickness at most) within TAIL_T x 40 / level
function levelOctaves(view: FogQualityView, k: number, level: number): number {
  const flat = flatOctaves(view, k);
  if (level <= 0) {
    return OCTAVE_SIZES.length;
  }
  const budget = (TAIL_T * QUALITY_LEVELS) / level;
  const thickness = sliceStart(k + 1) - sliceStart(k);
  let count = flat;
  let tau = 0;
  while (count < OCTAVE_SIZES.length) {
    const next = tau + DENSITY_SLOPE * 0.5 * OCTAVE_WEIGHTS[OCTAVE_SIZES.length - 1 - count]! * view.inputs.sigma * thickness;
    if (next > budget) break;
    tau = next;
    count++;
  }
  return count;
}

// whether a strike's stack is left out of slice k at `level`: the light it scatters there, at most (level / 40) x sigma x thickness x
// the phase's largest value x power / distance^2 (the albedo at most 1; power: the emitter's total, an irradiance of power / d^2 at
// the least distance d), is under TAIL_T. Level 0: always
function strikeSkip(view: FogQualityView, k: number, level: number, power: number, distance: number): boolean {
  if (level <= 0) {
    return true;
  }
  const thickness = sliceStart(k + 1) - sliceStart(k);
  const light = (level / QUALITY_LEVELS) * view.inputs.sigma * thickness * STRIKE_PHASE_MAX * (power / (distance * distance));
  return light < TAIL_T;
}

// the physical levels of the slices from..to-1 into out (the same for any split)
function processLevels(statics: Record<string, Float32Array>, view: FogQualityView, from: number, to: number, out: Uint8Array): void {
  lodScan(view);
  const starts = statics.bounds;
  for (let k = from; k < to; k++) {
    out[k] = levelOf(tailBound(view, LKEY.dyMax, starts[k]!));
  }
}

const Lod = { LEVELS: QUALITY_LEVELS, LEVEL_REFRESH_MOST, OCTAVE_WEIGHTS, DENSITY_SLOPE, STRIKE_PHASE_MAX, fractionTable, sliceTransmittance, sliceLevel, columnLevel, sliceHeld, levelRefresh, levelOctaves, strikeSkip, process: processLevels };

export const QualityFog = { SLICES, SLICE_NEAR, FOG_FAR, SLICE_LOG, CULL_BELOW, CULL_RELATIVE, TAIL_RADIANCE, TAIL_EXPOSURE, TAIL_SLOPE, TAIL_T, DRIFT_SPEED, REFRESH_FRACTION, REFRESH_MOST, SWEEP_SECONDS, OCTAVE_SIZES, TOP_MIP, NOISE_TEXELS, sliceStart, bounds, columnDy, columnCut, unread, tailBound, denseStart, denseHeld, sliceFootprint, refreshEvery, flatOctaves, process, Lod };

// the pool's kind "fog": the statics' `bounds` the slices' starts, the params the view
QualityJobs.register("fog", (statics, params, from, to, out) => {
  process(statics, params as unknown as FogQualityView, from, to, out);
});

// (the namespace's declaration, engine/namespace.ts, does not list it yet: registered through the untyped view)
M.QualityFog = QualityFog;
