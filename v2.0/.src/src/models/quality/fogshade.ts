// QualityFogShade: the fog's sky and moon shade grid (effects/fog.ts: what gets to each cell of the 128 x 64 x 96 grid from the sky and the moon through the
// clouds) baked on the CPU, pure: no GL, no page, importable in any thread (the quality workers bake with it).
// A cell holds (sky, moon) = through(p, p + dir 8 m, 4 places) for dir = up and, for the moon, the mean over the penumbra kernel's directions over its disc: exp(-(the mean of the medium's density at the 4 places + AIR_EXTINCTION)
// x 8), the density of shaders/fog/medium.glsl (sigma e^(-max(y, 0) / 4), none under 1e-5; 0.8 smoothstep(0.4, 0.6, n) (no floor); n = 0.55 N24 + 0.3 N10 + 0.15 N4,
// each a trilinear read of the noise at the level lod - log2(size), the octaves drifting with the time). The cell's place and lod are the shader's
// (shadePlace, shadeLod; the constants as its text prints them: the log with 6 decimals).
// Only the noise's levels 3..7 are ever read: lod is at least lodOf(2 m) = 8 (the places are 2 m apart), so the 24 m octave reads at 8 - log2(24) = 3.415 or
// more, the 10 m one at 4.68 or more, the 4 m one at 6 or more; the coarsest is clamped to 7. The 4,681 texels of those levels (16^3 + 8^3 + 4^3 + 2^3 + 1, as
// byte / 255 in float32, read back from the GPU's own mip chain) are the model's whole noise. The sampler's weights are exact here; the GPU's are fixed point
// (about 8 bits): the difference is bounded by the tests, not zero.
// Output: half pairs, out[((l * rows + y) * nx + x) * 2 + c], l the layer from layerFrom, c 0 the sky's and 1 the moon's: the layout texSubImage3D takes for
// a box of nx x rows over a run of layers. A cell's value does not depend on the window it is baked in.
// The schedule (Schedule): which of the grid's draws (the GPU's: `layers` layers each, SHADE_RATE a second, in order, by credit) are uploaded from a worker's
// reply and which the GPU bakes. A job for a draw is posted when its turn passes, for the time of its next turn (the density is a function of the time: the
// worker bakes the grid for the time it will be shown); at the turn a kept reply of the current version whose time is within MAX_TIME_ERROR of the frame's is
// uploaded, else the GPU bakes it (a late reply is simply the earlier behaviour). A frame with `view` (a view, setting or gap change) bakes every draw on the
// GPU and posts a job for each draw k for the time + (k + 1) / rate.
//
// Changelog:
// 2026-11-21: viewRays, columnsFor, boxesFor (the shadow grid's boxes from the view's rays, the mouse parallax's yaw, eye offset and drift included).
// 2026-11-22: Feature U3, story M4: the density's profile is StaticMist.frontProfile (the front's two scales); bake and bakeAt take a trailing optional front { tail, scale } (absent: the shipped defaults).
// 2026-11-22: bakeAt: the cells at fractional grid coordinates (the shade grid's jittered, reduced bake: Feature U2, story V1).
// 2026-11-21: bake's last argument y0, the first row of a box (the rows under it are read by nothing when the view only looks up); depthOf, rowFrom (Feature U1, story U7).
// 2026-11-12: the moon channel the mean over the penumbra kernel's directions (MoonDisc: MOON_KERNEL, the GPU's constants), the kernel an optional argument of bake.
// 2026-11-08: new.
import { M } from "../../engine/core";
import { Frame } from "../frame";
import { AIR_EXTINCTION } from "../../materials/fog";
import { StaticMist } from "../staticmist";
import { MOON_DIR, MoonDisc } from "../../materials/sky";

const ACROSS = 128;
const UP = 64;
const DEEP = 96;
const TOP = 48;
const NEAR = 0.5;
const FAR = 300;
// (the camera's SPAN: Camera.SPAN, checked by the effect)
const SPAN = 1.0;
const LOG = Number(Math.log(FAR / NEAR).toFixed(6));
const MIP_FROM = 3;
const MIP_LAST = 7;
const MIP_TEXELS = 4681;
// how far a reply's time may be from the frame's it is uploaded in (s: about 1 cm of the clouds' drift)
const MAX_TIME_ERROR = 0.1;

// the moon channel's kernel: the directions over the moon's disc (materials/sky.ts: MoonDisc.directions, the GPU's MOON_K0..: the shader's text prints them with nine
// decimals), the first MOON_KERNEL of them; the channel is the mean of the light through 8 m of each
const MOON_KERNEL = MoonDisc.KERNEL;
const KERNEL_DIRS = new Float64Array(MoonDisc.directions(MOON_DIR, MoonDisc.RADIUS, MoonDisc.KERNEL_MAX));

// where the levels start in the packed array: 3: 0, 4: 4096, 5: 4608, 6: 4672, 7: 4680
const OFFSETS = [0, 4096, 4608, 4672, 4680];
function mipOffset(level: number): number {
  return OFFSETS[level - MIP_FROM];
}

// levels[0..4]: the bytes of levels 3..7 (x fastest, then y, then z) as one array of byte / 255
function packMips(levels: Uint8Array[]): Float32Array {
  const out = new Float32Array(MIP_TEXELS);
  for (let k = 0; k < levels.length; k++) {
    const bytes = levels[k];
    const off = OFFSETS[k];
    for (let i = 0; i < bytes.length; i++) {
      out[off + i] = bytes[i] / 255;
    }
  }
  return out;
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

// a float as IEEE half bits, to nearest even
function toHalf(x: number): number {
  f32[0] = x;
  const b = u32[0];
  const sign = (b >>> 16) & 0x8000;
  const e = ((b >>> 23) & 0xff) - 127 + 15;
  const m = b & 0x7fffff;
  if (e >= 31) {
    return sign | 0x7c00;
  }
  if (e <= 0) {
    if (e < -10) {
      return sign;
    }
    const full = m | 0x800000;
    const shift = 14 - e;
    let half = full >>> shift;
    const rem = full & ((1 << shift) - 1);
    const mid = 1 << (shift - 1);
    if (rem > mid || (rem === mid && (half & 1) === 1)) {
      half++;
    }
    return sign | half;
  }
  let half = sign | (e << 10) | (m >>> 13);
  const rem = m & 0x1fff;
  if (rem > 0x1000 || (rem === 0x1000 && (half & 1) === 1)) {
    half++;
  }
  return half;
}

function fromHalf(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 31;
  const f = h & 1023;
  if (e === 0) {
    return s * f * 5.960464477539063e-8;
  }
  return s * (1 + f / 1024) * Math.pow(2, e - 15);
}

function slabBytes(layers: number, nx: number, rows: number): number {
  return layers * rows * nx * 4;
}

// the trilinear read of the level at texel offset `off`, n texels a side, at (q0, q1, q2) in texture coordinates (REPEAT: n is a power of two)
function tri(noise: Float32Array, off: number, n: number, q0: number, q1: number, q2: number): number {
  if (n === 1) {
    return noise[off];
  }
  const m = n - 1;
  const u0 = q0 * n - 0.5;
  const u1 = q1 * n - 0.5;
  const u2 = q2 * n - 0.5;
  // (floor by truncation: the coordinates are far inside 32 bits)
  let i0 = u0 | 0;
  if (i0 > u0) i0--;
  let i1 = u1 | 0;
  if (i1 > u1) i1--;
  let i2 = u2 | 0;
  if (i2 > u2) i2--;
  const fx = u0 - i0;
  const fy = u1 - i1;
  const fz = u2 - i2;
  const x0 = i0 & m;
  const x1 = (i0 + 1) & m;
  const y0 = (i1 & m) * n;
  const y1 = ((i1 + 1) & m) * n;
  const z0 = (i2 & m) * n * n;
  const z1 = ((i2 + 1) & m) * n * n;
  const a = noise[off + z0 + y0 + x0] + (noise[off + z0 + y0 + x1] - noise[off + z0 + y0 + x0]) * fx;
  const b = noise[off + z0 + y1 + x0] + (noise[off + z0 + y1 + x1] - noise[off + z0 + y1 + x0]) * fx;
  const c = noise[off + z1 + y0 + x0] + (noise[off + z1 + y0 + x1] - noise[off + z1 + y0 + x0]) * fx;
  const d = noise[off + z1 + y1 + x0] + (noise[off + z1 + y1 + x1] - noise[off + z1 + y1 + x0]) * fx;
  const e = a + (b - a) * fy;
  const f = c + (d - c) * fy;
  return e + (f - e) * fz;
}

// the per-cell reading state: each octave's two levels and the weight between them (set once for a cell: the level does not depend on the place)
let level24 = 0;
let level10 = 0;
let level4 = 0;
let mix24 = 0;
let mix10 = 0;
let mix4 = 0;
let sigmaNow = 0;
let timeNow = 0;
// the front's profile parameters of the bake in progress (the tail's share and scale: StaticMist.frontDensity)
let tailNow = StaticMist.TAIL_SHARE;
let scaleNow = StaticMist.TAIL_SCALE;

export interface FrontProfile {
  tail: number;
  scale: number;
}
function setFront(front?: FrontProfile): void {
  tailNow = front ? front.tail : StaticMist.TAIL_SHARE;
  scaleNow = front ? front.scale : StaticMist.TAIL_SCALE;
}

function octave(noise: Float32Array, q0: number, q1: number, q2: number, level: number, mix: number): number {
  const n0 = 128 >> level;
  const a = tri(noise, OFFSETS[level - MIP_FROM], n0, q0, q1, q2);
  if (mix === 0 || level >= MIP_LAST) {
    return a;
  }
  const n1 = n0 >> 1;
  const b = tri(noise, OFFSETS[level + 1 - MIP_FROM], n1, q0, q1, q2);
  return a + (b - a) * mix;
}

// the medium's density at (x, y, z)
function density(noise: Float32Array, x: number, y: number, z: number): number {
  const scale = sigmaNow * StaticMist.frontProfile(y, scaleNow, tailNow);
  if (scale < StaticMist.EXPIRY) {
    return 0;
  }
  const t = timeNow;
  const n =
    0.55 * octave(noise, x / 24 + t * 0.004, y / 24, z / 24 + t * 0.0016, level24, mix24) +
    0.3 * octave(noise, x / 10 - t * 0.0052, y / 10 + t * 0.0012, z / 10 + 0.31, level10, mix10) +
    0.15 * octave(noise, x / 4 + 0.17, y / 4 - t * 0.0024, z / 4 + t * 0.008, level4, mix4);
  const s = Math.min(1, Math.max(0, (n - 0.4) / 0.2));
  return scale * (0.8 * s * s * (3 - 2 * s));
}

// how much light gets through 8 m from (x, y, z) in the direction (dx, dy, dz): 4 places, 2 m apart, the first one 1 m along
function through(noise: Float32Array, x: number, y: number, z: number, dx: number, dy: number, dz: number): number {
  let depth = 0;
  for (let i = 0; i < 4; i++) {
    const s = 1 + 2 * i;
    depth += density(noise, x + dx * s, y + dy * s, z + dz * s);
  }
  return Math.exp(-(depth / 4 + AIR_EXTINCTION) * 8);
}

// the level and the weight to the next one for an octave of `size` metres at the cell's lod
function setLevel(lod: number, size: number, which: number): void {
  const l = Math.min(MIP_LAST, Math.max(0, lod - Math.log2(size)));
  const l0 = Math.floor(l);
  if (which === 0) {
    level24 = l0;
    mix24 = l - l0;
  } else if (which === 1) {
    level10 = l0;
    mix10 = l - l0;
  } else {
    level4 = l0;
    mix4 = l - l0;
  }
}

const LOG2_128 = 7;

// cells layerFrom..layerTo-1 (layers of the grid), rows y0..y0+rows-1 (y0 0: the rows from the water), columns x0..x0+nx-1, into out as half pairs (the first row of the box first)
function bake(noise: Float32Array, sigma: number, time: number, out: Uint16Array, layerFrom: number, layerTo: number, x0: number, nx: number, rows: number, kernel: number = MOON_KERNEL, y0: number = 0, front?: FrontProfile): void {
  sigmaNow = sigma;
  timeNow = time;
  setFront(front);
  let at = 0;
  for (let iz = layerFrom; iz < layerTo; iz++) {
    const z = NEAR * Math.exp((iz / (DEEP - 1)) * LOG);
    for (let iy = y0; iy < y0 + rows; iy++) {
      const gy = iy / (UP - 1);
      const y = gy * gy * TOP;
      const up = (2 * Math.sqrt(Math.max(y, 0) * TOP)) / (UP - 1);
      const size = Math.max(Math.max((2 * SPAN * z) / (ACROSS - 1), up), (z * LOG) / (DEEP - 1));
      // (the lod of the cell, raised to that of the places' spacing: lodOf(2 m))
      const lod = Math.max(Math.log2(Math.max(size * 128, 1e-6)), LOG2_128 + 1);
      setLevel(lod, 24, 0);
      setLevel(lod, 10, 1);
      setLevel(lod, 4, 2);
      for (let ix = x0; ix < x0 + nx; ix++) {
        const x = ((ix / (ACROSS - 1)) * 2 - 1) * SPAN * z;
        out[at++] = toHalf(through(noise, x, y, -z, 0, 1, 0));
        let moon = 0;
        for (let k = 0; k < kernel; k++) {
          moon += through(noise, x, y, -z, KERNEL_DIRS[3 * k], KERNEL_DIRS[3 * k + 1], KERNEL_DIRS[3 * k + 2]);
        }
        out[at++] = toHalf(moon / kernel);
      }
    }
  }
}

// the cells at fractional grid coordinates (index units): the layers zs, the rows ys, the columns xs (each cell's lod from its own place, as bake's); half pairs, out[((a * ys.length + b) * xs.length + c) * 2 + ch];
// at integer coordinates the values are bake's
function bakeAt(noise: Float32Array, sigma: number, time: number, out: Uint16Array, zs: ArrayLike<number>, ys: ArrayLike<number>, xs: ArrayLike<number>, kernel: number = MOON_KERNEL, front?: FrontProfile): void {
  sigmaNow = sigma;
  timeNow = time;
  setFront(front);
  let at = 0;
  for (let a = 0; a < zs.length; a++) {
    const z = NEAR * Math.exp((zs[a] / (DEEP - 1)) * LOG);
    for (let b = 0; b < ys.length; b++) {
      const gy = ys[b] / (UP - 1);
      const y = gy * gy * TOP;
      const up = (2 * Math.sqrt(Math.max(y, 0) * TOP)) / (UP - 1);
      const size = Math.max(Math.max((2 * SPAN * z) / (ACROSS - 1), up), (z * LOG) / (DEEP - 1));
      const lod = Math.max(Math.log2(Math.max(size * 128, 1e-6)), LOG2_128 + 1);
      setLevel(lod, 24, 0);
      setLevel(lod, 10, 1);
      setLevel(lod, 4, 2);
      for (let c = 0; c < xs.length; c++) {
        const x = ((xs[c] / (ACROSS - 1)) * 2 - 1) * SPAN * z;
        out[at++] = toHalf(through(noise, x, y, -z, 0, 1, 0));
        let moon = 0;
        for (let k = 0; k < kernel; k++) {
          moon += through(noise, x, y, -z, KERNEL_DIRS[3 * k], KERNEL_DIRS[3 * k + 1], KERNEL_DIRS[3 * k + 2]);
        }
        out[at++] = toHalf(moon / kernel);
      }
    }
  }
}

// the draws of the grid: which a worker's reply serves
class Schedule {
  draws: number;
  rate: number;
  credit: number;
  part: number;
  last: number;
  owedCount: number;
  drawOf: Int32Array;
  uploaded: Uint8Array;
  postCount: number;
  postDraw: Int32Array;
  postTime: Float64Array;
  // per draw: the job posted for it (0: none, 1: out, 2: its reply kept), its version and time
  jobState: Uint8Array;
  jobVersion: Int32Array;
  jobTime: Float64Array;
  gpuDraws: number;
  uploadDraws: number;
  lateDraws: number;
  staleDraws: number;

  constructor(draws: number, rate: number) {
    this.draws = draws;
    this.rate = rate;
    this.credit = 0;
    this.part = 0;
    this.last = NaN;
    this.owedCount = 0;
    this.drawOf = new Int32Array(draws);
    this.uploaded = new Uint8Array(draws);
    this.postCount = 0;
    this.postDraw = new Int32Array(draws);
    this.postTime = new Float64Array(draws);
    this.jobState = new Uint8Array(draws);
    this.jobVersion = new Int32Array(draws);
    this.jobTime = new Float64Array(draws);
    this.gpuDraws = 0;
    this.uploadDraws = 0;
    this.lateDraws = 0;
    this.staleDraws = 0;
  }

  // once a frame: the draws owed (in order; drawOf, uploaded for the first owedCount) and the jobs to post (postDraw, postTime for the first postCount)
  frame(time: number, view: boolean, version: number): void {
    const draws = this.draws;
    const passed = this.last === this.last ? time - this.last : 0;
    this.last = time;
    this.credit += view ? 0 : Math.max(0, passed) * this.rate;
    const owed = view ? draws : Math.min(draws, Math.floor(this.credit + 1e-6));
    this.credit = view ? 0 : Math.max(0, this.credit - owed);
    const from = view ? 0 : this.part;
    this.part = (from + owed) % draws;
    this.owedCount = owed;
    this.postCount = 0;
    for (let n = 0; n < owed; n++) {
      const k = (from + n) % draws;
      this.drawOf[n] = k;
      let up = 0;
      if (!view) {
        const state = this.jobState[k];
        if (state === 2 && this.jobVersion[k] === version) {
          if (Math.abs(this.jobTime[k] - time) <= MAX_TIME_ERROR + 1e-9) {
            up = 1;
          } else {
            this.staleDraws++;
          }
        } else if (state === 1) {
          this.lateDraws++;
        }
      }
      this.uploaded[n] = up;
      if (up) {
        this.uploadDraws++;
      } else {
        this.gpuDraws++;
      }
      const when = view ? time + (k + 1) / this.rate : time + draws / this.rate;
      this.jobState[k] = 1;
      this.jobVersion[k] = version;
      this.jobTime[k] = when;
      this.postDraw[this.postCount] = k;
      this.postTime[this.postCount] = when;
      this.postCount++;
    }
  }

  // a reply for the job posted for (draw, version, time): kept, once
  reply(draw: number, version: number, time: number): boolean {
    if (draw < 0 || draw >= this.draws || this.jobState[draw] !== 1 || this.jobVersion[draw] !== version || Math.abs(this.jobTime[draw] - time) > 1e-9) {
      return false;
    }
    this.jobState[draw] = 2;
    return true;
  }
}

// the depth (m) of layer n's node (the shader's z: NEAR e^(n / (DEEP - 1) LOG)); 0 under the first layer, whose reads begin at 0
function depthOf(layer: number): number {
  return layer < 0 ? 0 : NEAR * Math.exp((layer / (DEEP - 1)) * LOG);
}

// The first row of the grid that a read at depth zFrom or more can touch when every ray of the view rises at least `slope` per metre of depth (the camera looking up: sky only):
// such a ray is at the height eyeY + z slope or more at depth z, and rows are sqrt(height / TOP) (UP - 1). Two rows of slack (the trilinear read's node, the bake's own slack). 0 when
// the slope is not above 0: a ray going down meets the water, so the cells from the water up are read (also by the mirrored reads)
function rowFrom(eyeY: number, slope: number, zFrom: number): number {
  if (!(slope > 0)) {
    return 0;
  }
  const y = eyeY + zFrom * slope;
  const row = Math.floor(Math.sqrt(Math.min(1, Math.max(y, 0) / TOP)) * (UP - 1)) - 2;
  return row > 0 ? row : 0;
}

// The rays of the extended view, for the view and its drifted variants: the 9 x 9 places of the window extended by (mx, my) pixels on each side (edges and corners included), for the pitch
// tilt + a driftPitch and the yaw yaw + b driftYaw, a and b in -1, 0, 1 (the boxes are made again only after the mouse parallax's drift past its tolerance: the cells a drifted view reads are
// read by one of these). cx, cy: the image's centre (the lens); each ray a unit direction, 3 numbers in out (at least 3 x 81 x 9 long). Returns the number of rays.
const VIEW_GRID = 8;
const VIEW_RAYS = (VIEW_GRID + 1) * (VIEW_GRID + 1) * 9;
function viewRays(tilt: number, yaw: number, focal: number, cx: number, cy: number, width: number, height: number, mx: number, my: number, driftPitch: number, driftYaw: number, out: Float64Array): number {
  let n = 0;
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      const axes = Frame.axes(tilt + a * driftPitch, yaw + b * driftYaw);
      for (let j = 0; j <= VIEW_GRID; j++) {
        for (let i = 0; i <= VIEW_GRID; i++) {
          const u = (-mx + ((width + 2 * mx) * i) / VIEW_GRID - cx) / focal;
          const v = (cy - (-my + ((height + 2 * my) * j) / VIEW_GRID)) / focal;
          const x = axes.forward[0] + u * axes.right[0] + v * axes.up[0];
          const y = axes.forward[1] + u * axes.right[1] + v * axes.up[1];
          const z = axes.forward[2] + u * axes.right[2] + v * axes.up[2];
          const length = Math.hypot(x, y, z);
          out[n * 3] = x / length;
          out[n * 3 + 1] = y / length;
          out[n * 3 + 2] = z / length;
          n++;
        }
      }
    }
  }
  return n;
}

// The grid's columns (nodes, first and last) a draw of layers first..last can read, from the extremes sMin and sMax of dx / (-dz) over the view's rays and the eye's x range
// eyeX +- driftEye. A read at depth D along a ray is at the column of g = (eyeX + s D) / max(D, NEAR) (shaders/fog/medium.glsl gridAt: x over the distance, the distance not under
// NEAR), a trilinear read of layer n comes from the depths whose layer coordinate lies in [n - 1, n + 1) (clamped: the first layer's from depth 0, the last layer's up to any depth). g is
// linear in the eye and in s, and monotone in D on each side of NEAR, so its extremes are at the corners of those ranges and the ends of the depths' range (0, NEAR, the range's end,
// and infinity, where g is s). One node of slack to the first and two to the last (the nodes a read touches, floor and floor + 1, and one more each way).
function columnsFor(sMin: number, sMax: number, eyeX: number, driftEye: number, first: number, last: number): number[] {
  const from = first - 1 <= 0 ? 0 : depthOf(first - 1);
  const to = last + 1 >= DEEP - 1 ? Infinity : depthOf(last + 1);
  const depths = [from];
  if (from < NEAR && NEAR < to) {
    depths.push(NEAR);
  }
  depths.push(to);
  let low = Infinity;
  let high = -Infinity;
  for (let e = -1; e <= 1; e += 2) {
    const x = eyeX + e * driftEye;
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? sMin : sMax;
      for (let d = 0; d < depths.length; d++) {
        const D = depths[d];
        const g = D === Infinity ? s : (x + s * D) / Math.max(D, NEAR);
        low = Math.min(low, g);
        high = Math.max(high, g);
      }
    }
  }
  const column = (g: number) => Math.min(1, Math.max(0, (g / SPAN + 1) / 2)) * (ACROSS - 1);
  return [Math.max(0, Math.floor(column(low)) - 1), Math.min(ACROSS - 1, Math.floor(column(high)) + 2)];
}

// The boxes [first column, columns, rows, first row] of the draws of `layers` layers (the shadow grid's cells the view can read) from the rays (viewRays, `count` of them): the
// columns of columnsFor, the rows up to the height the highest ray (or the lowest ray mirrored in the water) reaches at the draw's deepest depth plus 2 rows of slack, and (cull: true, the shipped
// behaviour) from the row rowFrom gives for the lowest slope when every ray rises. A ray that does not go forward (dz not under 0) gives the whole grid. eyeY is the eye's height;
// driftEye the eye's drift tolerance (x and y).
function boxesFor(rays: ArrayLike<number>, count: number, eyeX: number, eyeY: number, layers: number, driftEye: number, cull: boolean): number[][] {
  let sMin = Infinity;
  let sMax = -Infinity;
  let slopeMin = Infinity;
  let slopeMax = -Infinity;
  let forward = count > 0;
  for (let n = 0; n < count && forward; n++) {
    const dz = rays[n * 3 + 2];
    if (!(dz < -1e-6)) {
      forward = false;
      break;
    }
    const s = rays[n * 3] / -dz;
    const slope = rays[n * 3 + 1] / -dz;
    sMin = Math.min(sMin, s);
    sMax = Math.max(sMax, s);
    slopeMin = Math.min(slopeMin, slope);
    slopeMax = Math.max(slopeMax, slope);
  }
  // (the highest height a read reaches at depth D: a direct read at eyeY + D slopeMax from the highest ray, a read mirrored in the water at D (-slopeMin) - eyeY from the lowest)
  const rising = forward ? Math.max(slopeMax, 0) : 0;
  const falling = forward ? Math.max(-slopeMin, 0) : 0;
  const lowest = forward && cull ? Math.max(0, slopeMin) : 0;
  const boxes: number[][] = [];
  for (let k = 0; k < DEEP; k += layers) {
    const last = Math.min(DEEP, k + layers) - 1;
    const columns = forward ? columnsFor(sMin, sMax, eyeX, driftEye, k, last) : [0, ACROSS - 1];
    const deepest = Math.min(DEEP - 1, k + layers);
    const z = depthOf(deepest);
    const top = Math.max(eyeY + driftEye + z * rising, z * falling - (eyeY - driftEye));
    const rows = forward ? Math.min(UP, Math.ceil(Math.sqrt(Math.min(1, top / TOP)) * (UP - 1)) + 2) : UP;
    const from = Math.min(rows - 1, rowFrom(eyeY - driftEye, lowest, depthOf(k - 1)));
    boxes.push([columns[0], columns[1] - columns[0] + 1, rows - from, from]);
  }
  return boxes;
}

export const QualityFogShade = { bakeAt, depthOf, rowFrom, viewRays, columnsFor, boxesFor, VIEW_RAYS, ACROSS, UP, DEEP, TOP, NEAR, FAR, SPAN, MOON_KERNEL, MIP_FROM, MIP_LAST, MIP_TEXELS, MAX_TIME_ERROR, mipOffset, packMips, toHalf, fromHalf, slabBytes, bake, Schedule };

M.QualityFogShade = QualityFogShade;
