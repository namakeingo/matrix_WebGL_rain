// QualityBolt: the lightning bands' adapter for the quality model (models/quality/unit.ts), pure: no GL, no page, runs in any
// thread from typed arrays. The units are the pieces of the strikes' lines (the items effects/bolt.ts keeps, 20 floats each, the
// slots' one after the other), twice: units 0 .. n-1 the pieces seen directly, units n .. 2n-1 the same pieces' mirror images (the
// band shader's m = (1, -1, 1): about the water plane y = 0), drawn into the reflection picture from the same camera, n = the pieces'
// count (the statics' sizes). A piece's level says whether its band can draw on the screen in that view. The water reads the
// reflection picture only afterwards, at bent coordinates: what is not drawn into the picture is not there to be read.
// What a piece's band draws (shaders/bolt/band_vertex.glsl, band_fragment.glsl, profile.glsl): light only where a pixel's ray
// passes within RHO of the piece's segment, with RHO = profileReach(P) depth / focal metres, depth the depth of the middle of the
// drawn part along the view, P = max(size focal / depth, 1) pixels (a line under a pixel is drawn a pixel wide) and profileReach
// the bell's reach in pixels: where g reaches BELL_END, plus a pixel. So:
//   - the unit is a SPHERE round the whole piece (its start to its end at full growth, which holds every part of it as grown; for
//     the mirror image y negated, the depths those of the image),
//     its radius half the piece's length plus RHO, RHO the greatest reach over the depths the shader can draw the piece at (the
//     depth of its middle lies between those of its ends; the reach never falls as the depth grows (the line's pixels fall while
//     its width in metres in the bell's tail grows), sampled at REACH_SAMPLES depths of that range, REACH_SLACK over);
//   - a pixel's ray passes at most RHO from a point of the segment, so that point is at most RHO outside every plane of the
//     frustum, but for the near plane: a ray's point between the eye and the near plane is in no plane, so the planes are widened
//     by the near plane's distance from the eye (the model's margin);
//   - nothing else hides a piece or its image: the fog, the water, the text's occluders and the blur are not terms here (the band's light is
//     HDR, so no transmittance is provably invisible; the shader hides under the waves; the occluders' picture is replaced after
//     the exposure measured it), so the model takes them off; its level only says "drawn" (1 to QUALITY_LEVELS, from the sphere's
//     size on the screen) or "hidden" (0: outside the view).
// A piece is hidden only when none of its band's pixels is on the screen, so the owners the shader counts (a pixel is the piece
// nearest the ray among a piece and its neighbours, the neighbours read from the data texture) are unchanged: a piece left out
// would have added nothing where it owns the pixel. The range is processed in chunks of CHUNK units over fixed scratch arrays, no
// allocation; each piece's level depends only on its own values and the frame's, so any split of a range gives the whole's
// levels. qualityBoltJob has the signature of a quality pool's job (statics, params, from, to, out).
//
// Changelog:
// 2026-11-12: the mirrored units' frustum is inputs.mirror's (the reflection's larger picture) when given.
// 2026-11-06: new.
// 2026-11-07: LOD of the band's tail (tailEpsTable, tailEnd, peakOf, bellSum, profileReachTo, extentLevel).
// 2026-11-07: the characters' units after the pieces' 2n (direct, then mirrored): culled exactly for the quad (the 12 corners of the path all outside one
//   clip plane); their LOD (glyphEpsTable, glyphDropped); tailEnd counts the brightest piece sharing a pixel (the shape of a cut piece weighs in the
//   pixel's value); pieceDropped; the bell's slope and curvature, mergeable, passError and passScale (the lower-resolution light pass: the bound only).
// 2026-11-07: the units twice: the pieces' mirror images (y -> -y) after the direct ones; listOf from a units' base; drawable and filter
//   (the pieces the band shader draws anything for at a growth and the slots' lights).
import { M } from "../../engine/core";
import { BELL_SPREAD, BELL_PX, BELL_LEAST, BELL_END } from "../../materials/bolt";
import { BoltItems } from "../boltitems";
import { QualityUnit } from "./unit";
import { QualityJobs } from "./jobs";
import type { QualityInputs } from "./unit";
import type { QualityViewInputs } from "./types";

// units processed at a time over the scratch arrays
const CHUNK = 256;
// the reach is the greatest over this many depths of a piece's range, and this much over that
const REACH_SAMPLES = 3;
const REACH_SLACK = 1.02;
// the shader's lowest depth for a line's width in pixels (band_vertex.glsl: max(pixels, 1e-3)) and a depth's floor here
const PIXELS_FLOOR = 1e-3;
const DEPTH_FLOOR = 1e-3;
const LN2 = 0.69314718;

// the static data: for each piece its start and end (x, y, z each) and its size in metres
export interface BoltQualityStatic {
  ends: ArrayLike<number>;
  sizes: ArrayLike<number>;
  // the characters' path points (GLYPH_UNIT_FLOATS each: p, j, n, size), when the job also culls them
  points?: ArrayLike<number>;
}

export interface BoltQualityParams {
  inputs: QualityViewInputs;
}

// the slots' pieces packed for the job, and each slot's first unit (slots + 1 values)
export interface BoltQualityPacked {
  ends: Float32Array;
  sizes: Float32Array;
  offsets: Int32Array;
}

// the bell's reach (pixels) of a line P pixels wide (shaders/bolt/profile.glsl: profileReach)
function profileReach(pixels: number): number {
  const lambda = Math.max(BELL_SPREAD * pixels, BELL_PX);
  const h = 0.5 * pixels;
  let s2 = (h * h) / (2 * LN2);
  if (s2 / lambda < h) {
    s2 = Math.max(2 * lambda * (h - lambda * LN2), BELL_LEAST * BELL_LEAST);
  }
  const z = s2 / lambda;
  const gt = (z * z) / (2 * s2);
  const r = BELL_END <= gt ? Math.sqrt(2 * s2 * BELL_END) : z + (BELL_END - gt) * lambda;
  return r + 1;
}


// ---- the LOD of the band's tail ----
// A band's glow is exp(-g(r)) times the piece's peak light, cut at g = BELL_END. Where the glow is under eps (an HDR value) it adds
// nothing, so a piece may cut its profile (and its quad) at g = ln(peak / eps) when that is under BELL_END. The peak is the most light a
// pixel of the piece can get (band_fragment.glsl: light x the fog (at most 1) x the shape (at most 1) x BAND_PER_SIZE x P / the bell's sum
// across). eps comes from the piece's level, the footprint of its extent on the screen (a piece under FOOTPRINT_FULL_PX has less): 0 at
// full detail (the cut BELL_END), TAIL_EPS_MAX at level 1, between by a few anchors. TAIL_EPS_MAX x EXPOSURE_BOUND stays under one level
// of 255 in the sRGB curve's linear part (12.92 x 255), EXPOSURE_BOUND the greatest gain the exposure puts on the picture.
const TAIL_EPS_MAX = 5e-5;
const EXPOSURE_BOUND = 4;
// [level, the share of TAIL_EPS_MAX given up (0: all of it, 1: none)]
const TAIL_ANCHORS: Array<[number, number]> = [[1, 0], [10, 0.3], [24, 0.7]];
// the glow's lowest cut, in g: a pixel's reach of the piece
const TAIL_END_FLOOR = 1;

function tailEpsTable(): Float32Array {
  const shares = QualityUnit.levelTable(TAIL_ANCHORS);
  const table = new Float32Array(shares.length);
  for (let l = 1; l < shares.length; l++) {
    table[l] = TAIL_EPS_MAX * (1 - shares[l]);
  }
  return table;
}

// the level of a piece whose extent on the screen is `pixels` (the longer of its length and its width)
function extentLevel(pixels: number): number {
  return QualityUnit.levelOf(QualityUnit.footprint(pixels));
}

// erf (Abramowitz and Stegun 7.1.26) and the bell's sum across both sides (shaders/bolt/band_fragment.glsl: bellSum)
function erfOf(x: number): number {
  const t = 1 / (1 + 0.3275911 * x);
  return 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
}
function bellSum(pixels: number): number {
  const lambda = Math.max(BELL_SPREAD * pixels, BELL_PX);
  const h = 0.5 * pixels;
  let s2 = (h * h) / (2 * LN2);
  if (s2 / lambda < h) {
    s2 = Math.max(2 * lambda * (h - lambda * LN2), BELL_LEAST * BELL_LEAST);
  }
  const z = s2 / lambda;
  return 2 * (Math.sqrt(s2 * 1.5707963) * erfOf(z / Math.sqrt(2 * s2)) + Math.exp((-z * z) / (2 * s2)) * lambda);
}

// the most light a pixel of a piece drawn `pixels` wide (widened to a pixel) can get from a light (vLight)
function peakOf(light: number, pixels: number): number {
  return (light * BoltItems.BAND_PER_SIZE * pixels) / bellSum(pixels);
}

// where the glow is cut, in g: BELL_END, or earlier where the peak's glow falls under eps; never under TAIL_END_FLOOR
// others: the greatest peak of the pieces sharing the piece's pixels (the pixel's value is (1 - exp(-lost)) light / shape summed over the lines: the
// shape removed by a cut weighs against the brightest light there), 0 for a piece alone
function tailEnd(peak: number, eps: number, others = 0): number {
  if (!(eps > 0)) {
    return BELL_END;
  }
  const total = peak + others;
  const end = total > eps ? Math.log(total / eps) : 0;
  return end >= BELL_END ? BELL_END : end > TAIL_END_FLOOR ? end : TAIL_END_FLOOR;
}

// whether a piece draws nothing: its light with the brightest one sharing its pixels is under eps (its whole shape removed changes a pixel by under eps)
function pieceDropped(peak: number, others: number, eps: number): boolean {
  return eps > 0 && peak + others < eps;
}

// the most peak a piece of a light can have over every width: the sup of P / bellSum(P) over the widths, a hair over
const PEAK_PER_LIGHT = (() => {
  let most = 0;
  for (let k = 0; k < 800; k++) {
    const p = Math.pow(10, -3 + (8 * k) / 799);
    most = Math.max(most, p / bellSum(p));
  }
  return most * 1.001;
})();
function peakBound(light: number): number {
  return light * BoltItems.BAND_PER_SIZE * PEAK_PER_LIGHT;
}

// the bell exp(-g(r)) of a line P pixels wide: its greatest |slope| and |curvature| across (Gaussian to z, then the exponential tail)
function bellParts(pixels: number): { s2: number; lambda: number; z: number; gt: number } {
  const lambda = Math.max(BELL_SPREAD * pixels, BELL_PX);
  const h = 0.5 * pixels;
  let s2 = (h * h) / (2 * LN2);
  if (s2 / lambda < h) {
    s2 = Math.max(2 * lambda * (h - lambda * LN2), BELL_LEAST * BELL_LEAST);
  }
  const z = s2 / lambda;
  return { s2, lambda, z, gt: (z * z) / (2 * s2) };
}
function bellSlope(pixels: number): number {
  const b = bellParts(pixels);
  const gauss = Math.sqrt(b.s2) <= b.z ? Math.exp(-0.5) / Math.sqrt(b.s2) : (b.z / b.s2) * Math.exp(-b.gt);
  return Math.max(gauss, Math.exp(-b.gt) / b.lambda);
}
function bellCurvature(pixels: number): number {
  const b = bellParts(pixels);
  return Math.max(1 / b.s2, Math.exp(-b.gt) / (b.lambda * b.lambda));
}

// whether pieces may be merged, moving their line by devPixels: the pixel changes by at most (peak + others) x slope x dev
function mergeable(devPixels: number, peak: number, others: number, pixels: number, eps: number): boolean {
  return devPixels === 0 || (eps > 0 && (peak + others) * bellSlope(pixels) * devPixels <= eps);
}

// the light pass read from a mask of 1/scale the resolution (bilinear, the three sums): the error bound, measured on the pixel formula (PASS_K)
const PASS_K = 2;
function passError(scale: number, peak: number, pixels: number): number {
  return scale <= 1 ? 0 : PASS_K * scale * scale * 0.125 * peak * bellCurvature(pixels);
}
// the largest scale of 4, 2, 1 whose error is within eps; 1 with characters (their cover is read 1:1 from the same mask) and at eps 0
function passScale(peak: number, pixels: number, eps: number, covers: boolean): number {
  if (covers || !(eps > 0)) {
    return 1;
  }
  return passError(4, peak, pixels) <= eps ? 4 : passError(2, peak, pixels) <= eps ? 2 : 1;
}

// ---- the characters (glyph items) ----
// A character is a quad of size w in the world's x and y (corners place + (+-w/2, +-w/2, 0), y of the whole negated for the mirror image) whose
// place moves along p -> j -> n: the swept quad lies in the hull of the 12 corners, so it is off the screen when they are all outside ONE plane of
// the clip box. The unit's level is the footprint level of its largest size (w focal / the nearest depth of its places), 0 when off the screen.
const GLYPH_UNIT_FLOATS = 10;
// characters that can share a pixel at most (their additive light adds up: the eps of a character is the tail's over this)
const GLYPH_OVERLAP_MAX = 4;

function glyphEpsTable(): Float32Array {
  const table = tailEpsTable();
  for (let l = 0; l < table.length; l++) {
    table[l] /= GLYPH_OVERLAP_MAX;
  }
  return table;
}
// the most light a character can give a pixel: its radiance over its ink x the slot's light (the shader's across and the fog are at most 1)
function glyphLightBound(radiance: number, inkMin: number, itemLight: number): number {
  return inkMin > 0 ? (radiance / inkMin) * itemLight : 0;
}
function glyphDropped(lightBound: number, eps: number): boolean {
  return eps > 0 && lightBound < eps;
}

// the characters' slots packed: p, j, n and the size of each (from the items' 20 floats: p 0..2, size 3, j 8..10, n 12..14), and the slots' first units
function packGlyphs(slots: { glyphs: ArrayLike<number> | null; count: number }[], stride: number): { points: Float32Array; offsets: Int32Array } {
  let total = 0;
  for (const slot of slots) {
    total += slot.glyphs ? slot.count : 0;
  }
  const points = new Float32Array(total * GLYPH_UNIT_FLOATS);
  const offsets = new Int32Array(slots.length + 1);
  let u = 0;
  for (let k = 0; k < slots.length; k++) {
    offsets[k] = u;
    const g = slots[k].glyphs;
    const count = g ? slots[k].count : 0;
    for (let i = 0; i < count; i++, u++) {
      const q = i * stride;
      const o = u * GLYPH_UNIT_FLOATS;
      points[o] = g![q];
      points[o + 1] = g![q + 1];
      points[o + 2] = g![q + 2];
      points[o + 3] = g![q + 8];
      points[o + 4] = g![q + 9];
      points[o + 5] = g![q + 10];
      points[o + 6] = g![q + 12];
      points[o + 7] = g![q + 13];
      points[o + 8] = g![q + 14];
      points[o + 9] = g![q + 3];
    }
  }
  offsets[slots.length] = u;
  return { points, offsets };
}

// units from to (0 .. g-1 direct, g .. 2g-1 mirrored) of the characters into out[base + unit]
function glyphRange(stat: BoltQualityStatic, params: BoltQualityParams, from: number, to: number, out: Uint8Array, base: number): void {
  const pts = stat.points;
  if (!pts) {
    for (let u = from; u < to; u++) {
      out[base + u] = 0;
    }
    return;
  }
  const f = params.inputs;
  const g = Math.floor(pts.length / GLYPH_UNIT_FLOATS);
  for (let u = from; u < to; u++) {
    const mirrored = u >= g;
    const vp = mirrored && f.mirror ? f.mirror.viewProjection : f.viewProjection;
    const o = (mirrored ? u - g : u) * GLYPH_UNIT_FLOATS;
    const flip = mirrored ? -1 : 1;
    const w = pts[o + 9];
    let outside = 63;
    let depth = Infinity;
    for (let k = 0; k < 3 && outside !== 0; k++) {
      const px = pts[o + k * 3], py = flip * pts[o + k * 3 + 1], pz = pts[o + k * 3 + 2];
      for (let c = 0; c < 4; c++) {
        // (the corner: x and y by +-w/2, the y of the whole flipped: the offsets are symmetric)
        const x = px + ((c & 1) - 0.5) * w, y = py + ((c >> 1) - 0.5) * w;
        const cx = vp[0] * x + vp[4] * y + vp[8] * pz + vp[12];
        const cy = vp[1] * x + vp[5] * y + vp[9] * pz + vp[13];
        const cz = vp[2] * x + vp[6] * y + vp[10] * pz + vp[14];
        const cw = vp[3] * x + vp[7] * y + vp[11] * pz + vp[15];
        if (!(cx - cw > 0)) outside &= ~1;
        if (!(-cx - cw > 0)) outside &= ~2;
        if (!(cy - cw > 0)) outside &= ~4;
        if (!(-cy - cw > 0)) outside &= ~8;
        if (!(cz - cw > 0)) outside &= ~16;
        if (!(-cz - cw > 0)) outside &= ~32;
      }
    }
    if (outside !== 0) {
      out[base + u] = 0;
      continue;
    }
    for (let k = 0; k < 3; k++) {
      const x = pts[o + k * 3], y = flip * pts[o + k * 3 + 1], z = pts[o + k * 3 + 2];
      const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (cw > 0 && cw < depth) {
        depth = cw;
      }
    }
    if (!(depth < Infinity)) {
      depth = DEPTH_FLOOR;
    }
    out[base + u] = extentLevel((w * f.focal) / Math.max(depth, DEPTH_FLOOR));
  }
}
function processGlyphs(stat: BoltQualityStatic, params: BoltQualityParams, from: number, to: number, out: Uint8Array): void {
  glyphRange(stat, params, from, to, out, 0);
}

// profileReach (shaders/bolt/profile.glsl) with the cut at g = end
function profileReachTo(pixels: number, end: number): number {
  const lambda = Math.max(BELL_SPREAD * pixels, BELL_PX);
  const h = 0.5 * pixels;
  let s2 = (h * h) / (2 * LN2);
  if (s2 / lambda < h) {
    s2 = Math.max(2 * lambda * (h - lambda * LN2), BELL_LEAST * BELL_LEAST);
  }
  const z = s2 / lambda;
  const gt = (z * z) / (2 * s2);
  return (end <= gt ? Math.sqrt(2 * s2 * end) : z + (end - gt) * lambda) + 1;
}

// the band's reach in metres of a piece of a size at a depth (band_vertex.glsl: the line widened to a pixel)
function reach(size: number, depth: number, focal: number): number {
  const pixels = (size * focal) / depth;
  const widen = Math.max(1, 1 / Math.max(pixels, PIXELS_FLOOR));
  return (profileReach(pixels * widen) * depth) / focal;
}

// the greatest reach over the depths from low to high a piece can be drawn at (a depth under DEPTH_FLOOR is taken as it)
function reachBound(size: number, depthLow: number, depthHigh: number, focal: number): number {
  const low = Math.max(depthLow, DEPTH_FLOOR);
  const high = Math.max(depthHigh, low);
  let most = 0;
  for (let k = 0; k < REACH_SAMPLES; k++) {
    const r = reach(size, low + ((high - low) * k) / (REACH_SAMPLES - 1), focal);
    if (r > most) {
      most = r;
    }
  }
  return most * REACH_SLACK;
}

// the scratch: the units given to the model
const UNITS: QualityInputs = {
  viewProjection: new Float32Array(16),
  eyeX: 0,
  eyeY: 0,
  eyeZ: 0,
  focal: 1,
  width: 1,
  height: 1,
  sigma: 0,
  air: 0,
  waterDrawn: false,
  waterY: 0,
  margin: 0,
  blur: 1,
  occluders: new Float32Array(0),
  occluderCount: 0,
  xs: new Float32Array(CHUNK),
  ys: new Float32Array(CHUNK),
  zs: new Float32Array(CHUNK),
  radii: new Float32Array(CHUNK),
};

// the eye's distance from the frustum's near plane (the view-projection's fourth row plus its third)
function nearDistance(vp: Float32Array, x: number, y: number, z: number): number {
  const a = vp[3] + vp[2], b = vp[7] + vp[6], c = vp[11] + vp[10], d = vp[15] + vp[14];
  const length = Math.sqrt(a * a + b * b + c * c);
  return length > 0 ? Math.abs(a * x + b * y + c * z + d) / length : 0;
}

function process(stat: BoltQualityStatic, params: BoltQualityParams, from: number, to: number, out: Uint8Array): void {
  const f = params.inputs;
  const vp = f.viewProjection;
  UNITS.viewProjection = vp;
  UNITS.eyeX = f.eyeX;
  UNITS.eyeY = f.eyeY;
  UNITS.eyeZ = f.eyeZ;
  UNITS.focal = f.focal;
  UNITS.width = f.width;
  UNITS.height = f.height;
  // (the terms left to the shader off; the near plane's distance widens every plane)
  UNITS.sigma = 0;
  UNITS.air = 0;
  UNITS.waterDrawn = false;
  UNITS.waterY = f.waterY;
  UNITS.blur = 1;
  UNITS.occluders = f.occluders;
  UNITS.occluderCount = 0;
  UNITS.margin = f.margin + nearDistance(vp, f.eyeX, f.eyeY, f.eyeZ);
  const ends = stat.ends, sizes = stat.sizes;
  const xs = UNITS.xs, ys = UNITS.ys, zs = UNITS.zs, radii = UNITS.radii;
  const n = sizes.length;
  let first = from;
  while (first < to) {
    if (first >= 2 * n) {
      // (the characters' units: their own range, written from 2n on)
      glyphRange(stat, params, first - 2 * n, to - 2 * n, out, 2 * n);
      return;
    }
    const mirrored = first >= n;
    // (a chunk never crosses from the direct units into the mirrored ones, nor into the characters')
    const m = Math.min(CHUNK, to - first, mirrored ? 2 * n - first : n - first);
    const flip = mirrored ? -1 : 1;
    const base = mirrored ? first - n : first;
    // (the mirror images' frustum: the reflection's larger picture when given; the depths, the w row, are the same)
    const v = mirrored && f.mirror ? f.mirror : f;
    UNITS.viewProjection = v.viewProjection;
    UNITS.width = v.width;
    UNITS.height = v.height;
    for (let j = 0; j < m; j++) {
      const i = base + j;
      const o = i * 6;
      const ax = ends[o], ay = flip * ends[o + 1], az = ends[o + 2], bx = ends[o + 3], by = flip * ends[o + 4], bz = ends[o + 5];
      const half = 0.5 * Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay) + (bz - az) * (bz - az));
      // (the depth of a point along the view: the view-projection's w)
      const da = vp[3] * ax + vp[7] * ay + vp[11] * az + vp[15];
      const db = vp[3] * bx + vp[7] * by + vp[11] * bz + vp[15];
      const rho = Math.max(da, db) > 0 ? reachBound(sizes[i], Math.min(da, db), Math.max(da, db), f.focal) : 0;
      xs[j] = 0.5 * (ax + bx);
      ys[j] = 0.5 * (ay + by);
      zs[j] = 0.5 * (az + bz);
      radii[j] = half + rho;
    }
    QualityUnit.process(UNITS, 0, m, LEVELS);
    for (let j = 0; j < m; j++) {
      out[first + j] = LEVELS[j];
    }
    first += m;
  }
}
const LEVELS = new Uint8Array(CHUNK);

// the pieces of the slots (each: its items' array and how many pieces it holds) as the job's arrays, one slot's after the other:
// the arrays hold exactly the pieces; offsets[k] is slot k's first unit, the last the total
function pack(slots: { segments: ArrayLike<number> | null; count: number }[], stride: number): BoltQualityPacked {
  let total = 0;
  for (const slot of slots) {
    total += slot.segments ? slot.count : 0;
  }
  const ends = new Float32Array(total * 6);
  const sizes = new Float32Array(total);
  const offsets = new Int32Array(slots.length + 1);
  let u = 0;
  for (let k = 0; k < slots.length; k++) {
    offsets[k] = u;
    const s = slots[k].segments;
    const count = s ? slots[k].count : 0;
    for (let i = 0; i < count; i++, u++) {
      const q = i * stride;
      const o = u * 6;
      ends[o] = s![q];
      ends[o + 1] = s![q + 1];
      ends[o + 2] = s![q + 2];
      ends[o + 3] = s![q + 4];
      ends[o + 4] = s![q + 5];
      ends[o + 5] = s![q + 6];
      sizes[u] = s![q + 3];
    }
  }
  offsets[slots.length] = u;
  return { ends, sizes, offsets };
}

// the units (from `levelBase` on: the mirrored half's) with a level over 0 as the items' indices (slot x region + piece in the slot), in order, into list (the first `total`
// values) and how many each slot has into counts; returns the total
function listOf(levels: Uint8Array, offsets: Int32Array, region: number, list: Uint32Array, counts: Int32Array, levelBase = 0): number {
  let total = 0;
  for (let k = 0; k + 1 < offsets.length; k++) {
    const begin = offsets[k], end = offsets[k + 1];
    const base = k * region - begin;
    let count = 0;
    for (let u = begin; u < end; u++) {
      if (levels[levelBase + u] > 0) {
        list[total++] = base + u;
        count++;
      }
    }
    counts[k] = count;
  }
  return total;
}

// whether the band shader (band_vertex.glsl) can draw anything of the piece at items[o ..] at a slot's growth and lights: its light (the
// piece's radiance x the band's share x its kind's light: the main channel's or the others') over 0, the growth within [its start, the
// growth it is hidden from), and part of it grown. Pieces for which this is false draw nothing (the shader moves them off the screen)
function drawable(segments: ArrayLike<number>, o: number, grown: number, mainLight: number, branchLight: number, band: number): boolean {
  const kindLight = segments[o + 11] > 1.5 ? mainLight : branchLight;
  if (!(segments[o + 7] > 0 && band > 0 && kindLight > 0)) {
    return false;
  }
  const start = segments[o + 16], end = segments[o + 17];
  if (!(grown >= start && grown < segments[o + 19])) {
    return false;
  }
  return end > start ? grown > start : grown >= end;
}

// a slot's listed pieces (list[from .. from+count-1]: items' indices, slot x region + piece) that are drawable, in order, to out from
// `at`; returns how many
function filter(segments: ArrayLike<number>, stride: number, region: number, list: Uint32Array, from: number, count: number, out: Uint32Array, at: number, grown: number, mainLight: number, branchLight: number, band: number): number {
  let kept = 0;
  for (let k = from; k < from + count; k++) {
    const index = list[k];
    if (drawable(segments, (index % region) * stride, grown, mainLight, branchLight, band)) {
      out[at + kept++] = index;
    }
  }
  return kept;
}

// a quality pool's job (models/quality/jobs.ts): the same, with the pool's argument order
export function qualityBoltJob(statics: BoltQualityStatic, params: BoltQualityParams, from: number, to: number, out: Uint8Array): void {
  process(statics, params, from, to, out);
}

export const QualityBolt = { QUALITY_LEVELS: QualityUnit.QUALITY_LEVELS, TAIL_EPS_MAX, EXPOSURE_BOUND, TAIL_ANCHORS, TAIL_END_FLOOR, FOOTPRINT_FULL_PX: QualityUnit.FOOTPRINT_FULL_PX, tailEpsTable, extentLevel, bellSum, peakOf, tailEnd, profileReachTo, pieceDropped, peakBound, bellSlope, bellCurvature, mergeable, passError, passScale, PASS_K, GLYPH_FLOATS: BoltItems.GLYPH_FLOATS, GLYPH_UNIT_FLOATS, GLYPH_OVERLAP_MAX, glyphEpsTable, glyphLightBound, glyphDropped, packGlyphs, processGlyphs, CHUNK, SEGMENT_FLOATS: BoltItems.SEGMENT_FLOATS, reach, reachBound, process, pack, listOf, drawable, filter };

// the pool's kind "bolt"
QualityJobs.register("bolt", (statics, params, from, to, out) => {
  process(statics as unknown as BoltQualityStatic, params as unknown as BoltQualityParams, from, to, out);
});

// (the namespace's type has no member for it yet: engine/namespace.ts)
M.QualityBolt = QualityBolt;
