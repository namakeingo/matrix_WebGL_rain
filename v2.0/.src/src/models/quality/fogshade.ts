// QualityFogShade: the fog's sky and moon shade grid (effects/fog.ts: what gets to each cell of the 128 x 64 x 96 grid from the sky and the moon through the
// clouds) baked on the CPU, pure: no GL, no page, importable in any thread (the quality workers bake with it).
// A cell holds (sky, moon) = through(p, p + dir 8 m, 4 places) for dir = up and, for the moon, the mean over the penumbra kernel's directions over its disc: exp(-(the mean of the medium's density at the 4 places + AIR)
// x 8), the density of shaders/fog/medium.glsl (sigma e^(-max(y, 0) / 4), none under 1e-5; 0.2 + 0.8 smoothstep(0.4, 0.6, n); n = 0.55 N24 + 0.3 N10 + 0.15 N4,
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
// 2026-11-12: the moon channel the mean over the penumbra kernel's directions (MoonDisc: MOON_KERNEL, the GPU's constants), the kernel an optional argument of bake.
// 2026-11-08: new.
import { M } from "../../engine/core";
import { AIR } from "../../materials/fog";
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
  const scale = sigmaNow * Math.exp(-Math.max(y, 0) / 4);
  if (scale < 1e-5) {
    return 0;
  }
  const t = timeNow;
  const n =
    0.55 * octave(noise, x / 24 + t * 0.004, y / 24, z / 24 + t * 0.0016, level24, mix24) +
    0.3 * octave(noise, x / 10 - t * 0.0052, y / 10 + t * 0.0012, z / 10 + 0.31, level10, mix10) +
    0.15 * octave(noise, x / 4 + 0.17, y / 4 - t * 0.0024, z / 4 + t * 0.008, level4, mix4);
  const s = Math.min(1, Math.max(0, (n - 0.4) / 0.2));
  return scale * (0.2 + 0.8 * s * s * (3 - 2 * s));
}

// how much light gets through 8 m from (x, y, z) in the direction (dx, dy, dz): 4 places, 2 m apart, the first one 1 m along
function through(noise: Float32Array, x: number, y: number, z: number, dx: number, dy: number, dz: number): number {
  let depth = 0;
  for (let i = 0; i < 4; i++) {
    const s = 1 + 2 * i;
    depth += density(noise, x + dx * s, y + dy * s, z + dz * s);
  }
  return Math.exp(-(depth / 4 + AIR) * 8);
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

// cells layerFrom..layerTo-1 (layers of the grid), rows 0..rows-1, columns x0..x0+nx-1, into out as half pairs
function bake(noise: Float32Array, sigma: number, time: number, out: Uint16Array, layerFrom: number, layerTo: number, x0: number, nx: number, rows: number, kernel: number = MOON_KERNEL): void {
  sigmaNow = sigma;
  timeNow = time;
  let at = 0;
  for (let iz = layerFrom; iz < layerTo; iz++) {
    const z = NEAR * Math.exp((iz / (DEEP - 1)) * LOG);
    for (let iy = 0; iy < rows; iy++) {
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

export const QualityFogShade = { ACROSS, UP, DEEP, TOP, NEAR, FAR, SPAN, MOON_KERNEL, MIP_FROM, MIP_LAST, MIP_TEXELS, MAX_TIME_ERROR, mipOffset, packMips, toHalf, fromHalf, slabBytes, bake, Schedule };

M.QualityFogShade = QualityFogShade;
