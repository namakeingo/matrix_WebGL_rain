// WaveFuse: the waves' steps of a frame as draws. Two consecutive steps are one draw of shaders/waves/step_fused_fragment.glsl (13 height taps, the state of
// each cell and its four neighbours, the damping and row sizes of each of those cells, the intermediate state off the grid zero, the picture of pushes taken in
// the first of the two steps): the same state as two single steps up to float32 rounding, half the writes but about 2.5 times the arithmetic. Measured on the
// GPU it costs more than two single steps at 1 to 2 steps a frame, about the same at 4 and 10 to 18% less at 16, so a frame is fused only from FUSE_MIN_STEPS
// steps: with the level of detail (and the effect's fuse switch) on and at least that many steps, floor(steps / 2) fused draws first and, for an odd count, one
// single draw last; otherwise (level of detail off, the earlier behaviour, or fewer steps) every step is a single draw. The frame's first draw takes the pushes.
// Pure: no GL, no page.
//
// Changelog:
// 2026-11-08: fused only from FUSE_MIN_STEPS (8) steps a frame (measured: a loss at 1 to 2 steps, a gain from about 8).
// 2026-11-08: new.
import { M } from "../../engine/core";

// the fewest steps a frame must have to be fused
const FUSE_MIN_STEPS = 8;

// the draws of `steps` steps into `out` (no allocation: the effect keeps one object); `min` the fewest steps that are fused
function planInto(steps: number, lod: boolean, out: { fused: number; single: number }, min: number = FUSE_MIN_STEPS): { fused: number; single: number } {
  const n = steps > 0 ? Math.floor(steps) : 0;
  out.fused = lod && n >= min ? Math.floor(n / 2) : 0;
  out.single = n - out.fused * 2;
  return out;
}

// the draws of `steps` steps: { fused, single }, fused x 2 + single = steps
function plan(steps: number, lod: boolean, min: number = FUSE_MIN_STEPS): { fused: number; single: number } {
  return planInto(steps, lod, { fused: 0, single: 0 }, min);
}

export const WaveFuse = { FUSE_MIN_STEPS, plan, planInto };

M.WaveFuse = WaveFuse;
