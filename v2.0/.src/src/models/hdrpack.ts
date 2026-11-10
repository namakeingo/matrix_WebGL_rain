// HdrPack: a 10 bit channel level carried by two 8 bit pixels, pure and with its shaders' texts. The HDR
// picture can leave the render worker as an ImageBitmap of a WebGL canvas (a transfer, not a CPU copy:
// WebGPU then copies it into a texture on the GPU), and a canvas image holds 8 bits a channel: a level
// q (0 to 1023) goes as its high 8 bits in one pixel and its low 2 bits scaled by STEP (0, 85, 170, 255:
// far apart, so a small error in a copy cannot move a level) in another, alpha always 255 (the image is
// premultiplied by alpha: 255 changes nothing). hi/lo/unpack are the reference of the shaders'
// packHdr (GLSL, shaders/hdr/pack.glsl) and unpackHdr (WGSL, shaders/webgpu/hdrunpack.wgsl).
//
// Changelog:
// 2026-11-05: new, an experiment for handing the HDR picture to WebGPU without a CPU readback.
// 2026-11-05: the check picture (checkLevels, checkWords): a known picture sent through the path once.
import { M } from "../engine/core";
import PACK_GLSL from "../shaders/hdr/pack.glsl";
import UNPACK_WGSL from "../shaders/webgpu/hdrunpack.wgsl";

const LEVELS = 1024;
const STEP = 85;

// the known picture the bridge sends through the bitmap path once to see its bytes arrive exactly: CHECK_WIDTH x
// CHECK_HEIGHT pixels, pixel i (row i / CHECK_WIDTH, bottom row first) with the levels checkLevels(i): every one of
// the 1024 levels in every channel, in different combinations
const CHECK_WIDTH = 64;
const CHECK_HEIGHT = 64;
const checkLevels = (i: number): number[] => [i % 1024, (i * 7 + 3) % 1024, (((1023 - i) % 1024) + 1024) % 1024];
const checkWords = (): Uint32Array => {
  const words = new Uint32Array(CHECK_WIDTH * CHECK_HEIGHT);
  for (let i = 0; i < words.length; i++) {
    const q = checkLevels(i);
    words[i] = (q[0] | (q[1] << 10) | (q[2] << 20) | (3 << 30)) >>> 0;
  }
  return words;
};

const hi = (q: number): number => q >> 2;
const lo = (q: number): number => (q & 3) * STEP;
const unpack = (h: number, l: number): number => (h << 2) | Math.round(l / STEP);

export const HdrPack = { LEVELS, STEP, hi, lo, unpack, CHECK_WIDTH, CHECK_HEIGHT, checkLevels, checkWords, GLSL: PACK_GLSL, WGSL: UNPACK_WGSL };

M.HdrPack = HdrPack;
