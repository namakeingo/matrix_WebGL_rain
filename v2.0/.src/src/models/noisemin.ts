// The noise's min-mip chain and the lower bounds from it (the pop bug, task 2; units.ui.popbug.ts). Pure, no GL, importable in any thread. A cull or a level of detail that applies the fog's transmittance to what is behind
// it must use an UPPER bound of that transmittance, so a LOWER bound of the density: the window of the noise reaches 0 in clear gaps, so the mean density is not one.
// - build(field, size): the chain: level 0 the field, level l the minimum over each 2^l cube (the minimum of the eight children of level l - 1)
// - read(chain, q, level): a lower bound of the trilinear read of the noise at texture coordinates q (repeating) and a fractional level: the least minimum of the eight texels around q at the two levels, less 1 / 255 (the
//   8-bit rounding of the mip chain), at least 0. A texel's minimum is at most its mean, which is what the GPU's mip holds
// - density(params, p, lod): M.QualityFogVolume.density with the reads replaced by read(params.chain, ...): a lower bound of that density (the window and the profile are monotone in the noise)
//
// Changelog:
// 2026-11-23: new (the pop bug, task 2).
import { M } from "../engine/core";
import { QualityFogVolume } from "./quality/fogvolume";

type Chain = ArrayLike<number>[];

function build(field: ArrayLike<number>, size = 128): Chain {
  const chain: Chain = [field];
  for (let n = size >> 1, l = 1; n >= 1; n >>= 1, l++) {
    const prev = chain[l - 1]!, out = new Float32Array(n * n * n), m = n * 2;
    for (let z = 0; z < n; z++) {
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          let low = Infinity;
          for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) low = Math.min(low, prev[((z * 2 + k) * m + y * 2 + j) * m + x * 2 + i]!);
          out[(z * n + y) * n + x] = low;
        }
      }
    }
    chain.push(out);
  }
  return chain;
}

// the least of the minima of the eight texels around q at one level
function around(level: ArrayLike<number>, n: number, q: number[]): number {
  const x = (q[0]! - Math.floor(q[0]!)) * n - 0.5, y = (q[1]! - Math.floor(q[1]!)) * n - 0.5, z = (q[2]! - Math.floor(q[2]!)) * n - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  let low = Infinity;
  for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) low = Math.min(low, level[((((z0 + k) % n) + n) % n * n + (((y0 + j) % n) + n) % n) * n + (((x0 + i) % n) + n) % n]!);
  return low;
}

function read(chain: Chain, q: number[], level: number): number {
  const top = chain.length - 1, l = Math.min(Math.max(level, 0), top), lo = Math.floor(l), hi = Math.min(lo + 1, top);
  const size = 1 << top;
  const a = around(chain[lo]!, size >> lo, q), b = lo === hi ? a : around(chain[hi]!, size >> hi, q);
  return Math.max(0, Math.min(a, b) - 1 / 255);
}

function density(params: unknown, p: number[], lod: number): number {
  const withChain = params as { chain: Chain };
  return QualityFogVolume.density(Object.assign({}, params, { read: (q: number[], level: number) => read(withChain.chain, q, level) }) as never, p, lod);
}

export const NoiseMin = { build, read, density };

M.NoiseMin = NoiseMin;
