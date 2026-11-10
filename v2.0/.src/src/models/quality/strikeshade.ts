// QualityStrikeShade: the strikes' fog shadow grids (effects/fog.ts: what gets to each cell of the 128 x 64 x 96 grid, for each of a strike emitter's 4 regions,
// from the region's nearest shadow point through the clouds) baked on the CPU, pure: no GL, no page, importable in any thread (the quality workers bake with it).
// A cell holds four values, one a region g: the region's shadow points (centroid, radius; radius -1: none; texels 4..35 of the emitter, 8 a region) give the one with
// the least (distance - radius) from the cell (the first on a tie), near, and the value is 1 for a region with no point, else
//   through(p, near, 4 places, lod) = exp(-(the mean of the medium's density at the 4 places + AIR) |near - p|)
// with lod = max(shadeLod(p), lodOf(|near - p| / 4)) and the density of shaders/fog/medium.glsl (sigma e^(-max(y, 0) / 4), none under 1e-5; 0.2 + 0.8 smoothstep(0.4,
// 0.6, n); n = 0.55 N24 + 0.3 N10 + 0.15 N4, each a trilinear read of the noise at the level lod - log2(size) clamped to 0..7, the octaves drifting with the time).
// The cell's place and lod are the shader's (shadePlace, shadeLod; the log as its text prints it: 6 decimals).
// Unlike the sky's shade (fogshade.ts) the reads reach the fine levels: a cell next to the bolt of a strike 6 m away has both lod terms near log2(6.8 z) and reads
// the 24 m octave at level 0.77. The noise is all of the levels 0..7 as bytes (2,396,745: read back from the GPU's own mip chain once). The sampler's weights are
// exact here; the GPU's are fixed point (about 8 bits): the difference is bounded by the tests, not zero.
// Output: half quads, out[((l * rows + y) * nx + x) * 4 + g], l the layer from layerFrom: the layout texSubImage3D takes (RGBA, HALF_FLOAT) for a box of nx x rows
// over a run of layers. A cell's value does not depend on the window it is baked in.
// The schedule (Schedule): which planned strike's grid a worker baked ahead (from the strike's flash, for its start time) and is whole and valid when the strike
// starts, so it is uploaded (in UPLOAD_FRAMES frames: the GPU's two shadow stages) instead of baked by the GPU. Jobs are posted for a strike announced between
// MIN_LEAD and HORIZON seconds before its start (the workers' bake takes about 1.2 to 2 s of one core: one worker is reserved for the bakes), at most MOST_HELD strikes held
// at once; a view's new version, a settings change, a time off by more than MAX_TIME_ERROR or a missing part at the start is the GPU's bake (the earlier behaviour).
//
// Changelog:
// 2026-11-08: new.
import { M } from "../../engine/core";
import { AIR } from "../../materials/fog";
import { QualityFogShade } from "./fogshade";

const ACROSS = 128;
const UP = 64;
const DEEP = 96;
const TOP = 48;
const NEAR = 0.5;
const FAR = 300;
// (the camera's SPAN: Camera.SPAN, checked by the effect)
const SPAN = 1.0;
const LOG = Number(Math.log(FAR / NEAR).toFixed(6));
const GROUPS = 4;
const POINTS = 8;
const POINT_FLOATS = GROUPS * POINTS * 4;
// the emitter's floats: the shadow points start at texel GROUPS (after the regions' headers)
const POINTS_FROM = GROUPS * 4;
const MIP_FROM = 0;
const MIP_LAST = 7;
const MIP_TEXELS = 2396745;
// how far a strike's start may be from the time its grid was baked for (s: about 1 cm of the clouds' drift)
const MAX_TIME_ERROR = 0.1;
// the soonest before its start a strike's bake is posted (s: the worker's bake, with its replies), the earliest, and the strikes held at once (2 x 6.3 MB)
const MIN_LEAD = 3;
const HORIZON = 6;
const MOST_HELD = 2;
// the frames a grid's upload takes: the GPU's two shadow stages
const UPLOAD_FRAMES = 2;
// the strikes announced and not started, at most
const ENTRIES = 16;

const OFFSETS = [0, 2097152, 2359296, 2392064, 2396160, 2396672, 2396736, 2396744];
function mipOffset(level: number): number {
  return OFFSETS[level - MIP_FROM];
}

// levels[0..7]: the bytes of levels 0..7 (x fastest, then y, then z) as one array
function packMips(levels: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(MIP_TEXELS);
  for (let k = 0; k < levels.length; k++) {
    out.set(levels[k], OFFSETS[k]);
  }
  return out;
}

// the 128 floats of an emitter's shadow points (a copy)
function pointsOf(floats: Float32Array): Float32Array {
  return floats.slice(POINTS_FROM, POINTS_FROM + POINT_FLOATS);
}

function slabBytes(layers: number, nx: number, rows: number): number {
  return layers * rows * nx * 8;
}

// the trilinear read (in bytes) of the level at byte offset `off`, n texels a side, at (q0, q1, q2) in texture coordinates (REPEAT: n is a power of two)
function tri(noise: Uint8Array, off: number, n: number, q0: number, q1: number, q2: number): number {
  if (n === 1) {
    return noise[off];
  }
  const m = n - 1;
  const u0 = q0 * n - 0.5;
  const u1 = q1 * n - 0.5;
  const u2 = q2 * n - 0.5;
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

// the reading state: each octave's level and the weight to the next one (set for a cell's group), the sigma and the time
let level24 = 0;
let level10 = 0;
let level4 = 0;
let mix24 = 0;
let mix10 = 0;
let mix4 = 0;
let sigmaNow = 0;
let timeNow = 0;

// an octave's value (0 to 1) at the level and the weight between it and the next
function octave(noise: Uint8Array, q0: number, q1: number, q2: number, level: number, mix: number): number {
  const n0 = 128 >> level;
  const a = tri(noise, OFFSETS[level], n0, q0, q1, q2);
  if (mix === 0 || level >= MIP_LAST) {
    return a * (1 / 255);
  }
  const b = tri(noise, OFFSETS[level + 1], n0 >> 1, q0, q1, q2);
  return (a + (b - a) * mix) * (1 / 255);
}

// the medium's density at (x, y, z)
function density(noise: Uint8Array, x: number, y: number, z: number): number {
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

const LOG2_24 = Math.log2(24);
const LOG2_10 = Math.log2(10);
const LOG2_4 = 2;

// the level and the weight to the next one of an octave (size = 2^log2size metres) at lod
function setLevel(lod: number, log2size: number, which: number): void {
  const l = Math.min(MIP_LAST, Math.max(0, lod - log2size));
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

// what gets from (px, py, pz) to region g's nearest shadow point through the clouds (1 for a region with no point)
function group(noise: Uint8Array, points: Float32Array, g: number, px: number, py: number, pz: number, lod: number): number {
  let best = 1e9;
  let least = 1e9;
  let nx = px;
  let ny = py;
  let nz = pz;
  const base = g * POINTS * 4;
  for (let j = 0; j < POINTS; j++) {
    const o = base + j * 4;
    const w = points[o + 3];
    if (w < 0) {
      continue;
    }
    const dx = points[o] - px;
    const dy = points[o + 1] - py;
    const dz = points[o + 2] - pz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d - w < least) {
      least = d - w;
      best = d;
      nx = points[o];
      ny = points[o + 1];
      nz = points[o + 2];
    }
  }
  if (!(best < 1e8)) {
    return 1;
  }
  const ex = nx - px;
  const ey = ny - py;
  const ez = nz - pz;
  const len = Math.sqrt(ex * ex + ey * ey + ez * ez);
  const at = Math.max(lod, Math.log2(Math.max(len * 0.25 * 128, 1e-6)));
  setLevel(at, LOG2_24, 0);
  setLevel(at, LOG2_10, 1);
  setLevel(at, LOG2_4, 2);
  let depth = 0;
  for (let i = 0; i < 4; i++) {
    const u = (i + 0.5) / 4;
    depth += density(noise, px + ex * u, py + ey * u, pz + ez * u);
  }
  return Math.exp(-(depth / 4 + AIR) * len);
}

// cells layerFrom..layerTo-1 (layers of the grid), rows 0..rows-1, columns x0..x0+nx-1, into out as half quads
function bake(noise: Uint8Array, points: Float32Array, sigma: number, time: number, out: Uint16Array, layerFrom: number, layerTo: number, x0: number, nx: number, rows: number): void {
  sigmaNow = sigma;
  timeNow = time;
  const toHalf = QualityFogShade.toHalf;
  let at = 0;
  for (let iz = layerFrom; iz < layerTo; iz++) {
    const z = NEAR * Math.exp((iz / (DEEP - 1)) * LOG);
    for (let iy = 0; iy < rows; iy++) {
      const gy = iy / (UP - 1);
      const y = gy * gy * TOP;
      const up = (2 * Math.sqrt(Math.max(y, 0) * TOP)) / (UP - 1);
      const size = Math.max(Math.max((2 * SPAN * z) / (ACROSS - 1), up), (z * LOG) / (DEEP - 1));
      const lod = Math.log2(Math.max(size * 128, 1e-6));
      for (let ix = x0; ix < x0 + nx; ix++) {
        const x = ((ix / (ACROSS - 1)) * 2 - 1) * SPAN * z;
        for (let g = 0; g < GROUPS; g++) {
          out[at++] = toHalf(group(noise, points, g, x, y, -z, lod));
        }
      }
    }
  }
}

// the draws of the viewed boxes (box k: [first column, columns, rows] for the layers of draw k) split over `frames` frames of about equal bytes, in order
function uploadPlan(boxes: ArrayLike<ArrayLike<number>>, layersPerDraw: number, frames: number): { from: number; to: number }[] {
  const n = boxes.length;
  let total = 0;
  for (let k = 0; k < n; k++) {
    total += slabBytes(layersPerDraw, boxes[k][1], boxes[k][2]);
  }
  const plan: { from: number; to: number }[] = [];
  let k = 0;
  let cum = 0;
  for (let f = 0; f < frames; f++) {
    const from = k;
    const target = (total * (f + 1)) / frames;
    while (k < n) {
      const b = slabBytes(layersPerDraw, boxes[k][1], boxes[k][2]);
      if (f < frames - 1 && cum + b / 2 > target) {
        break;
      }
      cum += b;
      k++;
    }
    plan.push({ from, to: k });
  }
  return plan;
}

// which planned strikes' grids the CPU holds, with the workers' replies in them (parts: the jobs a strike's grid is made of, one a draw)
class Schedule {
  parts: number;
  postCount: number;
  postId: Int32Array;
  postPart: Int32Array;
  postTime: Float64Array;
  cpuStarts: number;
  gpuStarts: number;
  lateStarts: number;
  unpostedStarts: number;
  staleStarts: number;
  dropped: number;
  refused: number;
  epoch: number;
  // per entry: in use, the strike's id, start and view version, whether its jobs went out, the epoch, the parts kept (a flag each, and their count)
  used: Uint8Array;
  id: Int32Array;
  start: Float64Array;
  version: Int32Array;
  posted: Uint8Array;
  entryEpoch: Int32Array;
  kept: Uint8Array;
  keptCount: Int32Array;

  constructor(parts: number) {
    this.parts = parts;
    this.postCount = 0;
    this.postId = new Int32Array(parts * MOST_HELD);
    this.postPart = new Int32Array(parts * MOST_HELD);
    this.postTime = new Float64Array(parts * MOST_HELD);
    this.cpuStarts = 0;
    this.gpuStarts = 0;
    this.lateStarts = 0;
    this.unpostedStarts = 0;
    this.staleStarts = 0;
    this.dropped = 0;
    this.refused = 0;
    this.epoch = 0;
    this.used = new Uint8Array(ENTRIES);
    this.id = new Int32Array(ENTRIES);
    this.start = new Float64Array(ENTRIES);
    this.version = new Int32Array(ENTRIES);
    this.posted = new Uint8Array(ENTRIES);
    this.entryEpoch = new Int32Array(ENTRIES);
    this.kept = new Uint8Array(ENTRIES * parts);
    this.keptCount = new Int32Array(ENTRIES);
  }

  find(id: number): number {
    for (let e = 0; e < ENTRIES; e++) {
      if (this.used[e] === 1 && this.id[e] === id) {
        return e;
      }
    }
    return -1;
  }

  has(id: number): boolean {
    return this.find(id) >= 0 && this.posted[this.find(id)] === 1;
  }

  release(e: number): void {
    this.used[e] = 0;
    this.posted[e] = 0;
    this.keptCount[e] = 0;
  }

  // a planned strike's flash is known: its start and the view's version (one entry a strike; the table full: it is the GPU's)
  announce(id: number, start: number, version: number): void {
    if (this.find(id) >= 0) {
      this.release(this.find(id));
    }
    for (let e = 0; e < ENTRIES; e++) {
      if (this.used[e] === 0) {
        this.used[e] = 1;
        this.id[e] = id;
        this.start[e] = start;
        this.version[e] = version;
        this.posted[e] = 0;
        this.entryEpoch[e] = this.epoch;
        this.keptCount[e] = 0;
        this.kept.fill(0, e * this.parts, (e + 1) * this.parts);
        return;
      }
    }
  }

  // a planned strike dropped
  withdraw(id: number): void {
    const e = this.find(id);
    if (e >= 0) {
      this.release(e);
    }
  }

  // the grid's inputs changed (sigma): nothing held or in flight is valid
  settingsChanged(): void {
    this.epoch++;
    for (let e = 0; e < ENTRIES; e++) {
      if (this.used[e] === 1) {
        this.release(e);
        this.dropped++;
      }
    }
  }

  held(): number {
    let n = 0;
    for (let e = 0; e < ENTRIES; e++) {
      if (this.used[e] === 1 && this.posted[e] === 1) {
        n++;
      }
    }
    return n;
  }

  // once a frame: the entries of another view's version or whose start is over dropped; the jobs to post (postId, postPart, postTime for the first postCount)
  frame(time: number, version: number): void {
    this.postCount = 0;
    let held = 0;
    for (let e = 0; e < ENTRIES; e++) {
      if (this.used[e] === 1 && (this.version[e] !== version || this.start[e] + MAX_TIME_ERROR < time)) {
        this.release(e);
        this.dropped++;
      } else if (this.used[e] === 1 && this.posted[e] === 1) {
        held++;
      }
    }
    while (held < MOST_HELD) {
      let pick = -1;
      for (let e = 0; e < ENTRIES; e++) {
        if (this.used[e] === 1 && this.posted[e] === 0) {
          const lead = this.start[e] - time;
          if (lead >= MIN_LEAD && lead <= HORIZON && (pick < 0 || this.start[e] < this.start[pick])) {
            pick = e;
          }
        }
      }
      if (pick < 0) {
        break;
      }
      this.posted[pick] = 1;
      this.entryEpoch[pick] = this.epoch;
      held++;
      for (let part = 0; part < this.parts; part++) {
        this.postId[this.postCount] = this.id[pick];
        this.postPart[this.postCount] = part;
        this.postTime[this.postCount] = this.start[pick];
        this.postCount++;
      }
    }
  }

  // a reply for the job posted for (id, part, version, time): kept, once
  reply(id: number, part: number, version: number, time: number): boolean {
    const e = this.find(id);
    if (e < 0 || this.posted[e] === 0 || part < 0 || part >= this.parts || this.version[e] !== version || this.entryEpoch[e] !== this.epoch || this.start[e] !== time || this.kept[e * this.parts + part] === 1) {
      this.refused++;
      return false;
    }
    this.kept[e * this.parts + part] = 1;
    this.keptCount[e]++;
    return true;
  }

  // the strike started: whether its grid is whole and valid for this time, version and epoch (then uploaded); its entry is gone either way
  begin(id: number, time: number, version: number): boolean {
    const e = this.find(id);
    if (e < 0) {
      this.gpuStarts++;
      return false;
    }
    let ok = false;
    if (this.posted[e] === 0) {
      this.unpostedStarts++;
    } else if (this.keptCount[e] < this.parts) {
      this.lateStarts++;
    } else if (this.version[e] !== version || this.entryEpoch[e] !== this.epoch || Math.abs(time - this.start[e]) > MAX_TIME_ERROR + 1e-9) {
      this.staleStarts++;
    } else {
      ok = true;
    }
    this.release(e);
    if (ok) {
      this.cpuStarts++;
    } else {
      this.gpuStarts++;
    }
    return ok;
  }
}

export const QualityStrikeShade = {
  ACROSS,
  UP,
  DEEP,
  TOP,
  NEAR,
  FAR,
  SPAN,
  GROUPS,
  POINTS,
  POINT_FLOATS,
  MIP_FROM,
  MIP_LAST,
  MIP_TEXELS,
  MAX_TIME_ERROR,
  MIN_LEAD,
  HORIZON,
  MOST_HELD,
  UPLOAD_FRAMES,
  mipOffset,
  packMips,
  pointsOf,
  toHalf: QualityFogShade.toHalf,
  fromHalf: QualityFogShade.fromHalf,
  slabBytes,
  bake,
  uploadPlan,
  Schedule,
};

M.QualityStrikeShade = QualityStrikeShade;
