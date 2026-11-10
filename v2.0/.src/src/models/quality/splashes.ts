// QualitySplashes: the splashes' adapter for the quality model (models/quality/unit.ts), pure: no GL, no page, runs in any thread
// from typed arrays. A live splash is two units, its direct view and its mirror image in the reflection: the job's unit i < N is
// splash i seen directly, unit N + i its image (the same camera, every y negated, no water drawn above it), N the splashes' count.
// For a splash the stamps drawn this frame are those of ages 0 to trail - 1 that the vertex shader takes as shown (shaders/splashes/
// vertex.glsl): its count k = step - age - first within [0, count), the step after the last jump (from) and not past the last
// step moved on to (to), differences of unsigned steps. Their places are the ballistic arc between the times of the first and
// last of them (time = k / rate + offset after the splash's start): x and z linear, y a parabola clamped at the water, so the arc's
// box is the two ends' (and the apex's height when it lies between them). The unit is:
//   - a SPHERE round that box, its radius half the box's diagonal plus the quad's half diagonal (size / sqrt 2) plus SLACK (the
//     shader works in 32 bit floats): the splash is hidden in a view only when all of it is (frustum, the drawn water for the
//     direct view, the opaque rectangles, the blur) or when the fog leaves under 1/255 along the way to the sphere's NEAREST point
//     (the clouds' lowest density at the path's highest point, the sphere's top: the mirror image's path is folded at the water,
//     so its highest point is the splash's own);
//   - ONE glyph-sized unit at the arc's middle, whose footprint, fog and blur give the level, at least 1 for a splash not hidden.
// Level 0 is hidden. The range is processed unit by unit over one scratch inputs object, no allocation; each unit's level depends
// only on its own values and the frame's, so any split of a range gives the whole's levels. qualitySplashesJob has the signature
// of a quality pool's job (statics, params, from, to, out); the splashes' records come in the params (they change every frame),
// the statics are unused.
//
// Changelog:
// 2026-11-07: ageCut and listedAges (the stamps instanced by the light left), pointPx, isPoint and pointGain (a sub-pixel quad as a point).
// 2026-11-07: the LOD rules (lodFloor, stampPeak, stampDropped): the direct view drops stamps whose brightest light is under a quarter level.
// 2026-11-06: new (the pool's job kind "splashes").
import { M } from "../../engine/core";
import { QualityUnit } from "./unit";
import { QualityJobs } from "./jobs";
import { INVISIBLE } from "./types";
import type { QualityInputs } from "./unit";
import type { QualityFrame } from "./rain";

// the splashes' gravity (m/s²: effects/splashes.ts GRAVITY, the shader's)
const GRAVITY = 9.81;
// metres added to a sphere's radius for the shader's 32 bit arithmetic
const SLACK = 1e-3;
// the fog's extinctions as given to the glyph unit's level (the level only: it never hides)
const FOG_SLACK = 0.98;
// units a task of the pool is worth at least
const CHUNK = 256;

// a splash's record: 10 values in the params' data, in this order
const FIELD = { x0: 0, z0: 1, vx: 2, vy: 3, vz: 4, size: 5, offset: 6, rate: 7, first: 8, count: 9 };
const STRIDE = 10;

export interface SplashQualityParams {
  // the frame's step, the last jump's step (no stamps up to it), the last step moved on to, the trail's steps
  step: number;
  from: number;
  to: number;
  trail: number;
  // the splashes' count, and their records (STRIDE values each, FIELD's order)
  count: number;
  data: ArrayLike<number>;
  inputs: QualityFrame;
}

// a splash's sphere for the frame: the first and last stamp counts drawn, the sphere's centre (the direct view's) and radius, and
// the place of the arc's middle
export interface SplashSphere {
  kmin: number;
  kmax: number;
  cx: number;
  cy: number;
  cz: number;
  r: number;
  mx: number;
  my: number;
  mz: number;
}

// the scratch: the inputs given to the model (the units' own arrays are not read: one unit at a time)
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
  xs: new Float32Array(0),
  ys: new Float32Array(0),
  zs: new Float32Array(0),
  radii: new Float32Array(0),
};
const SCRATCH: SplashSphere = { kmin: 0, kmax: 0, cx: 0, cy: 0, cz: 0, r: 0, mx: 0, my: 0, mz: 0 };

// the height of the arc at a time after the splash's start (the shader's: clamped at the water)
function heightAt(vy: number, t: number): number {
  const y = vy * t - (GRAVITY * t * t) / 2;
  return y > 0 ? y : 0;
}

// splash j's sphere for the frame; false when no stamp of it is drawn
function sphereOf(params: SplashQualityParams, j: number, into: SplashSphere): boolean {
  const d = params.data;
  const o = j * STRIDE;
  const count = d[o + FIELD.count];
  // (the shader's differences of unsigned steps, as signed 32 bit)
  const k0 = (params.step - d[o + FIELD.first]) | 0;
  const sinceJump = (params.step - params.from) | 0;
  const pastEnd = (params.to - params.step) | 0;
  // the ages drawn: 0 to trail - 1, k = k0 - age within [0, count), the stamp's step after the jump and not past the last
  let ageLo = k0 - count + 1;
  if (ageLo < 0) ageLo = 0;
  if (-pastEnd > ageLo) ageLo = -pastEnd;
  let ageHi = params.trail - 1;
  if (k0 < ageHi) ageHi = k0;
  if (sinceJump - 1 < ageHi) ageHi = sinceJump - 1;
  if (ageLo > ageHi) return false;
  const kmin = k0 - ageHi, kmax = k0 - ageLo;
  const rate = d[o + FIELD.rate], offset = d[o + FIELD.offset];
  const ta = kmin / rate + offset, tb = kmax / rate + offset;
  const x0 = d[o + FIELD.x0], z0 = d[o + FIELD.z0], vx = d[o + FIELD.vx], vy = d[o + FIELD.vy], vz = d[o + FIELD.vz];
  const xa = x0 + vx * ta, xb = x0 + vx * tb, za = z0 + vz * ta, zb = z0 + vz * tb;
  const ya = heightAt(vy, ta), yb = heightAt(vy, tb);
  const ylo = ya < yb ? ya : yb;
  let yhi = ya < yb ? yb : ya;
  const apex = vy / GRAVITY;
  if (apex > ta && apex < tb) yhi = (vy * vy) / (2 * GRAVITY);
  const dx = Math.abs(xb - xa), dy = yhi - ylo, dz = Math.abs(zb - za);
  const quad = d[o + FIELD.size] * Math.SQRT1_2;
  into.kmin = kmin;
  into.kmax = kmax;
  into.cx = (xa + xb) * 0.5;
  into.cy = (ylo + yhi) * 0.5;
  into.cz = (za + zb) * 0.5;
  into.r = 0.5 * Math.sqrt(dx * dx + dy * dy + dz * dz) + quad + SLACK;
  const tm = (ta + tb) * 0.5;
  into.mx = x0 + vx * tm;
  into.my = heightAt(vy, tm);
  into.mz = z0 + vz * tm;
  return true;
}

// the scratch of a chunk: the spheres' centres and radii as given to the model, each sphere's glyph (the arc's middle), the units
// the spheres belong to, and the levels
const XS = new Float32Array(CHUNK);
const YS = new Float32Array(CHUNK);
const ZS = new Float32Array(CHUNK);
const RS = new Float32Array(CHUNK);
const MX = new Float64Array(CHUNK);
const MY = new Float64Array(CHUNK);
const MZ = new Float64Array(CHUNK);
const MR = new Float64Array(CHUNK);
const LIST = new Int32Array(CHUNK);
const LEVELS = new Uint8Array(CHUNK);

// the levels of the units from..to-1 of one view (mirror: the images, units N and over; j = unit - first splash's unit), a chunk
// at a time over the scratch
function chunk(params: SplashQualityParams, from: number, to: number, mirror: boolean, out: Uint8Array): void {
  const f = params.inputs;
  const sign = mirror ? -1 : 1;
  const base = mirror ? params.count : 0;
  const s = SCRATCH;
  const m = to - from;
  // pass 1: the spheres of the splashes with a stamp drawn
  let k = 0;
  for (let q = 0; q < m; q++) {
    const j = from + q - base;
    if (sphereOf(params, j, s)) {
      XS[k] = s.cx;
      YS[k] = sign * s.cy;
      ZS[k] = s.cz;
      RS[k] = s.r;
      MX[k] = s.mx;
      MY[k] = sign * s.my;
      MZ[k] = s.mz;
      MR[k] = params.data[j * STRIDE + FIELD.size] * Math.SQRT1_2;
      LIST[k] = q;
      k++;
    } else {
      out[from + q] = 0;
    }
  }
  if (k === 0) {
    return;
  }
  // the whole arc: the frustum, the water (the direct view only: the mirror image is under it by design), the rectangles, the blur
  UNITS.xs = XS;
  UNITS.ys = YS;
  UNITS.zs = ZS;
  UNITS.radii = RS;
  UNITS.sigma = 0;
  UNITS.air = 0;
  UNITS.waterDrawn = mirror ? false : f.waterDrawn;
  QualityUnit.process(UNITS, 0, k, LEVELS);
  // the fog along the way to the sphere's nearest point (the sphere's top is the path's highest point; the mirror image's path is
  // folded at the water, so its highest point is the splash's own)
  const foggy = f.sigma > 0 || f.air > 0;
  let alive = 0;
  for (let c = 0; c < k; c++) {
    let seen = LEVELS[c] > 0;
    if (seen && foggy) {
      const dx = XS[c] - f.eyeX, dy = YS[c] - f.eyeY, dz = ZS[c] - f.eyeZ;
      const nearest = Math.sqrt(dx * dx + dy * dy + dz * dz) - RS[c];
      const top = sign * YS[c] + RS[c];
      seen = QualityUnit.transmittance(nearest > 0 ? nearest : 0, f.sigma, f.air, top > f.eyeY ? top : f.eyeY) >= INVISIBLE;
    }
    if (seen) {
      XS[alive] = MX[c];
      YS[alive] = MY[c];
      ZS[alive] = MZ[c];
      RS[alive] = MR[c];
      LIST[alive] = LIST[c];
      alive++;
    } else {
      out[from + LIST[c]] = 0;
    }
  }
  if (alive === 0) {
    return;
  }
  // the level: the glyph at the arc's middle, the footprint, fog and blur
  UNITS.sigma = f.sigma * FOG_SLACK;
  UNITS.air = f.air * FOG_SLACK;
  UNITS.waterDrawn = false;
  QualityUnit.process(UNITS, 0, alive, LEVELS);
  for (let c = 0; c < alive; c++) {
    out[from + LIST[c]] = LEVELS[c] > 0 ? LEVELS[c] : 1;
  }
}

// LOD (detail below what the camera resolves), the direct view only. A stamp's brightest light is its colour's brightest component
// (the head whitened and gained) times its trail's fade times the fog (vLight), ink and cover at most 1. A stamp whose brightest
// light is under LOD_LIGHT_FLOOR (a quarter of a level of 255, so that overlapping stamps stay far under one level) is not drawn:
// its integrated light is what the dropped stamps' sum would add, under the floor a pixel. The mirrored pass is never lowered:
// its distance output (the character's distance where its ink is solid) is what the water's reflected lookups read, so every
// stamp it would draw stays. A level of 40 (or LOD off) is full detail: a floor of 0 drops nothing.
const LOD_LIGHT_FLOOR = 0.25 / 255;

// the floor for a pass: 0 with LOD off or in the mirrored pass; the tests' scale of the characters' light (viewScale) lowers it
function lodFloor(lod: boolean, mirror: boolean, viewScale: number): number {
  if (!lod || mirror) return 0;
  return viewScale > 1 ? LOD_LIGHT_FLOOR / viewScale : LOD_LIGHT_FLOOR;
}

// the brightest a stamp's colour can be: the colour's brightest component (maxColor) for a trail stamp (age over 0); the head
// (age 0) is mixed to white by Head brightness and gained: at most max(maxColor, 1) x headGain, headGain = 1 + HEAD_GAIN x head
function stampPeak(maxColor: number, age: number, headGain: number): number {
  if (age > 0) return maxColor;
  return (maxColor > 1 ? maxColor : 1) * headGain;
}

// whether a stamp of this light (vLight) and peak is under the floor, so not drawn (a floor of 0 drops none)
function stampDropped(light: number, peak: number, floor: number): boolean {
  return light * peak < floor;
}

// The stamp count: the ages 0 to trail - 1 of a splash are lit at most fade(a) x peak(a) x transmittance, fade = 1 - a / trail,
// peak(0) the head's and peak(a over 0) the colour's brightest component. That bound never rises with the age, so the stamps under
// the floor are a tail the shader's own test drops anyway (the real fog is never over the bound's): the length of the head part is
// the ages to instance (0: none lit). A floor of 0 keeps every age.
function ageCut(maxColor: number, headGain: number, transmittance: number, floor: number, trail: number): number {
  let cut = 0;
  const head = (maxColor > 1 ? maxColor : 1) * headGain * transmittance;
  if (head >= floor) {
    cut = 1;
    for (let a = 1; a < trail; a++) {
      if (maxColor * (1 - a / trail) * transmittance >= floor) cut = a + 1;
      else break;
    }
  }
  return cut;
}

// the ages an instanced draw of a list needs: the most any of the first count splashes' cuts needs
function listedAges(cuts: ArrayLike<number>, count: number): number {
  let most = 0;
  for (let i = 0; i < count; i++) if (cuts[i] > most) most = cuts[i];
  return most;
}

// A quad under POINT_PX pixels lights a pixel centre (then its pixel by the mean ink) with the probability of its area; as a point
// it lights its pixel by that area times the ink: the same light over the pixels. Kept for a stamp whose brightest light is under
// POINT_PEAK_MAX (4 levels of 255), so that no pixel is off by more than that. Never in the mirrored pass or with LOD off.
const POINT_PX = 0.5;
const POINT_PEAK_MAX = 4 / 255;

function pointPx(lod: boolean, mirror: boolean): number {
  return lod && !mirror ? POINT_PX : 0;
}

function isPoint(footprint: number, peakLight: number, pxLimit: number): boolean {
  return pxLimit > 0 && footprint <= pxLimit && peakLight <= POINT_PEAK_MAX;
}

function pointGain(footprint: number): number {
  return footprint >= 1 ? 1 : footprint * footprint;
}

// the levels of the units from..to-1 (0 to 2 N - 1) into out (0: hidden)
function process(params: SplashQualityParams, from: number, to: number, out: Uint8Array): void {
  const f = params.inputs;
  UNITS.viewProjection = f.viewProjection;
  UNITS.eyeX = f.eyeX;
  UNITS.eyeY = f.eyeY;
  UNITS.eyeZ = f.eyeZ;
  UNITS.focal = f.focal;
  UNITS.width = f.width;
  UNITS.height = f.height;
  UNITS.waterY = f.waterY;
  UNITS.margin = f.margin;
  UNITS.blur = f.blur;
  UNITS.occluders = f.occluders;
  UNITS.occluderCount = f.occluderCount;
  const n = params.count;
  // (the direct units, then the images: a chunk is of one view)
  for (let a = from; a < to && a < n; a += CHUNK) {
    chunk(params, a, Math.min(a + CHUNK, to, n), false, out);
  }
  for (let a = Math.max(from, n); a < to; a += CHUNK) {
    chunk(params, a, Math.min(a + CHUNK, to), true, out);
  }
}

// a quality pool's job (models/quality/jobs.ts): the same, with the pool's argument order
export function qualitySplashesJob(params: SplashQualityParams, from: number, to: number, out: Uint8Array): void {
  process(params, from, to, out);
}

export const QualitySplashes = { STRIDE, FIELD, GRAVITY, SLACK, CHUNK, LOD_LIGHT_FLOOR, POINT_PX, POINT_PEAK_MAX, ageCut, listedAges, pointPx, isPoint, pointGain, sphereOf, process, lodFloor, stampPeak, stampDropped };

QualityJobs.register("splashes", (_statics, params, from, to, out) => {
  process(params as unknown as SplashQualityParams, from, to, out);
});

// (not in the namespace's type: read by the tests through a cast)
M.QualitySplashes = QualitySplashes;
