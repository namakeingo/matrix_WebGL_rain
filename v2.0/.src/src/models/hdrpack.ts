// HdrPack: 10 bit channel levels carried by 8 bit pixels, pure and with its shaders' texts. The HDR
// picture can leave the render worker as an ImageBitmap of a WebGL canvas (a transfer, not a CPU copy:
// WebGPU then copies it into a texture on the GPU), and a canvas image holds 8 bits a channel. A row of
// width pixels is carried in packedWidth(width) = width + ceil(width / 4) columns: columns 0 to width - 1
// hold the high 8 bits of each level (hi), column width + k the low 2 bits of the pixels 4k to 4k + 3 as
// 2 bit fields of one byte (pixel 4k + j in bits 2j and 2j + 1, lowByte; the unused fields of the last
// byte 0); alpha always 255 (the image is premultiplied by alpha: 255 changes nothing). A bit
// rearrangement, so lossless where the copy keeps the bytes (the self-check proves it). hi, lowByte,
// unpack, packRow and unpackRow are the reference of the shaders' packHdr and packHdrLow (GLSL,
// shaders/hdr/pack.glsl) and unpackHdr (WGSL, shaders/webgpu/hdrunpack.wgsl).
//
// Changelog:
// 2026-11-05: new, an experiment for handing the HDR picture to WebGPU without a CPU readback.
// 2026-11-05: the check picture (checkLevels, checkWords): a known picture sent through the path once.
// 2026-11-17: the low 2 bits of four pixels in one byte (1.25 width columns, was 2 width: the low bits scaled by 85 in a column of their own); the check picture covers every level at every x mod 4 and every low-bits byte.
import { M } from "../engine/core";
import PACK_GLSL from "../shaders/hdr/pack.glsl";
import UNPACK_WGSL from "../shaders/webgpu/hdrunpack.wgsl";

const LEVELS = 1024;

// the known picture the bridge sends through the bitmap path once to see its bytes arrive exactly: CHECK_WIDTH x
// CHECK_HEIGHT pixels (CHECK_WIDTH a multiple of 4: the groups of four pixels do not wrap a row), pixel i (row i / CHECK_WIDTH,
// bottom row first) with the levels checkLevels(i). With g = i >> 2 (0 to 1023) and r = i & 3: the level of channel c is g
// rotated left by 2 ((r + c) & 3) bits in 10 bits, so (1) in each channel every level appears exactly once at every x mod 4
// (a rotation is a bijection of g), and (2) the four low fields of a group are four distinct base 4 digits of g, so all 256
// values of the low-bits byte appear (each 4 times) in every channel
const CHECK_WIDTH = 64;
const CHECK_HEIGHT = 64;
const rotate10 = (g: number, s: number): number => ((g << s) | (g >> (10 - s))) & 1023;
const checkLevels = (i: number): number[] => {
  const g = i >> 2;
  const r = i & 3;
  return [rotate10(g, 2 * (r & 3)), rotate10(g, 2 * ((r + 1) & 3)), rotate10(g, 2 * ((r + 2) & 3))];
};
const checkWords = (): Uint32Array => {
  const words = new Uint32Array(CHECK_WIDTH * CHECK_HEIGHT);
  for (let i = 0; i < words.length; i++) {
    const q = checkLevels(i);
    words[i] = (q[0] | (q[1] << 10) | (q[2] << 20) | (3 << 30)) >>> 0;
  }
  return words;
};

const hi = (q: number): number => q >> 2;
// the columns a row of width pixels takes: the high bits, then a low-bits byte a group of four pixels
const packedWidth = (width: number): number => width + Math.ceil(width / 4);
// the low-bits byte of up to 4 levels (a missing one is 0)
const lowByte = (levels: ArrayLike<number>): number => {
  let b = 0;
  for (let j = 0; j < 4 && j < levels.length; j++) {
    b |= (levels[j] & 3) << (2 * j);
  }
  return b;
};
// the level of pixel x from its high byte and its group's low-bits byte
const unpack = (high: number, low: number, x: number): number => (high << 2) | ((low >> (2 * (x & 3))) & 3);
// one channel of a row: width levels as packedWidth(width) bytes
const packRow = (levels: ArrayLike<number>, width: number): Uint8Array => {
  const bytes = new Uint8Array(packedWidth(width));
  for (let x = 0; x < width; x++) {
    bytes[x] = hi(levels[x]);
    bytes[width + (x >> 2)] |= (levels[x] & 3) << (2 * (x & 3));
  }
  return bytes;
};
const unpackRow = (bytes: ArrayLike<number>, width: number): Uint16Array => {
  const levels = new Uint16Array(width);
  for (let x = 0; x < width; x++) {
    levels[x] = unpack(bytes[x], bytes[width + (x >> 2)], x);
  }
  return levels;
};

export const HdrPack = { LEVELS, hi, packedWidth, lowByte, unpack, packRow, unpackRow, CHECK_WIDTH, CHECK_HEIGHT, checkLevels, checkWords, GLSL: PACK_GLSL, WGSL: UNPACK_WGSL };

M.HdrPack = HdrPack;
