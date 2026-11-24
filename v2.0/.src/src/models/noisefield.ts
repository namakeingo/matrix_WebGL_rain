// The fog's noise on the CPU (Feature P1, story M7b; units.ui.basemistcpu.ts): the GPU's generator (Fog.init: shaders/fog/seed_fragment.glsl, blur_fragment.glsl, finish_fragment.glsl, then the mip chain) as production code, so
// that the base mist's worker takes no noise from the GPU. Pure, no GL, no page, importable in any thread.
// - levels(stretch): the 8 levels (level l is (128 >> l)^3 values, x fastest, then y, then z) as whole bytes over 255: level 0 = the hash of the cell (M.hash of i + 7919, over 2^32) blurred by six boxes of 5 (x, y, z, x, y, z, wrapping,
//   in 32-bit floats as the R32F targets hold them), stretched about 0.5 by `stretch` (M.FogMist.NOISE_STRETCH), clamped and rounded to a byte; level l the mean of the 8 bytes of level l - 1 rounded to a byte (the GPU's mip chain
//   averages the stored bytes)
// - bytes(stretch): the levels packed in one Uint8Array, level after level (M.BaseMistJob.packNoise's layout); cached by the stretch (the last one)
//
// Changelog:
// 2026-11-23: new (Feature P1, story M7b).
import { M } from "../engine/core";

const N = 128;
const LEVELS = 8;

const cache: { stretch: number; levels: Float32Array[]; bytes: Uint8Array } = { stretch: NaN, levels: [], bytes: new Uint8Array(0) };

function generate(stretch: number): Float32Array[] {
  const total = N * N * N;
  let a = new Float32Array(total), b = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    a[i] = M.hash((i + 7919) >>> 0) / 4294967296;
  }
  for (let pass = 0; pass < 6; pass++) {
    const axis = pass % 3, stride = axis === 0 ? 1 : axis === 1 ? N : N * N;
    for (let i = 0; i < total; i++) {
      const c = axis === 0 ? i % N : axis === 1 ? Math.floor(i / N) % N : Math.floor(i / (N * N));
      let s = 0;
      for (let k = -2; k <= 2; k++) {
        s += a[i + (((c + k + N) % N) - c) * stride]!;
      }
      b[i] = s / 5;
    }
    [a, b] = [b, a];
  }
  const levels: Float32Array[] = [a.map((v) => Math.round(Math.min(Math.max(0.5 + (v - 0.5) * stretch, 0), 1) * 255) / 255)];
  for (let l = 1; l < LEVELS; l++) {
    const n = N >> l, p = levels[l - 1]!, pn = n * 2, next = new Float32Array(n * n * n);
    for (let z = 0; z < n; z++) {
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          let s = 0;
          for (let k = 0; k < 8; k++) {
            s += Math.round(p[2 * x + (k & 1) + (2 * y + ((k >> 1) & 1)) * pn + (2 * z + (k >> 2)) * pn * pn]! * 255);
          }
          next[x + y * n + z * n * n] = Math.round(s / 8) / 255;
        }
      }
    }
    levels.push(next);
  }
  return levels;
}

function fill(stretch: number): void {
  if (cache.stretch !== stretch) {
    const levels = generate(stretch);
    let total = 0;
    for (let l = 0; l < LEVELS; l++) {
      total += levels[l]!.length;
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const level of levels) {
      for (let i = 0; i < level.length; i++) {
        bytes[at + i] = Math.round(level[i]! * 255);
      }
      at += level.length;
    }
    cache.stretch = stretch;
    cache.levels = levels;
    cache.bytes = bytes;
  }
}

function levels(stretch: number): Float32Array[] {
  fill(stretch);
  return cache.levels;
}

function bytes(stretch: number): Uint8Array {
  fill(stretch);
  return cache.bytes;
}

export const NoiseField = { levels, bytes };

M.NoiseField = NoiseField;
