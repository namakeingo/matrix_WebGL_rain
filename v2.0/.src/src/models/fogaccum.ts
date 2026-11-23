// FogAccum: the fog volume's temporal accumulation as a pure model (no GL, no page; Feature U1, story U6, the shipped build of the volume's slices after a view frame).
// The volume's slices are built at a reduced number of columns with a jittered sample position each frame and blended into the held volume by an exponential moving average over N frames.
// - jitter(k): the frame k's sample offset [jx, jy, jz], each in [0, 1): the R3 additive recurrence (Roberts, the generalised golden ratio: the plastic number's powers 1/g, 1/g^2, 1/g^3), a low-discrepancy
//   sequence, with a seed per axis that puts the mean of the first 64 samples within 0.01 of 0.5 on each axis. jx and jy move the sample inside the reduced column (as an offset of the column's
//   middle), jz the sample's place inside the slice along the ray.
// - alpha(frame, n): the blend's weight of frame `frame` since a reset: 1 for the first (the new volume exactly), then max(1 / (frame + 1), 1 / n) (the running mean until it is 1 / n).
// - blend(held, fresh, a): held += a (fresh - held), in place; a = 1 copies the fresh values exactly.
// - reduced(full, factor): the reduced grid's size from the full grid's: ceil(full / factor), never below 8 and never above the full size; a factor under 1 is 1.
// - accumulates(kind): whether a light is blended: the sky's and the Orb's ('sky', 'orb'), never a strike's ('strike': the stacks of a strike are not accumulated, a flash is not ghosted).
// - FRAMES: the frames N of the average, the constant 8 (the effect's Fog.accum starts at it; the tests set 0 for the committed all-exact build).
//
// Changelog:
// 2026-11-21: new (Feature U1, story U6).
// 2026-11-21: wanted(test, value): the accumulator is made only with the option on.
// 2026-11-22: promoted to the shipped path: wanted, parse and MOST_FRAMES gone, FRAMES = 8.
import { M } from "../engine/core";

// the frames N of the average
const FRAMES = 8;
// the R3 sequence's steps per axis (1 / g^n, g the plastic number: the real root of g^3 = g + 1) and the seeds that centre the first 64 samples' means
const PLASTIC = 1.2207440846057596;
const STEP = [1 / PLASTIC, 1 / (PLASTIC * PLASTIC), 1 / (PLASTIC * PLASTIC * PLASTIC)];
const SEED = [0.58, 0.59, 0.18];

// the frame k's offset in [0, 1) on three axes
function jitter(k: number): number[] {
  const n = Math.max(0, Math.floor(k)) + 1;
  return STEP.map((s, axis) => (SEED[axis]! + s * n) % 1);
}

// the weight of the frame `frame` after a reset
function alpha(frame: number, n: number): number {
  return frame <= 0 ? 1 : Math.max(1 / (frame + 1), 1 / n);
}

// held += a (fresh - held) in place (a >= 1: the fresh values exactly)
function blend(held: Float32Array, fresh: Float32Array, a: number): void {
  if (a >= 1) {
    held.set(fresh);
    return;
  }
  for (let i = 0; i < held.length; i++) {
    held[i] = held[i]! + a * (fresh[i]! - held[i]!);
  }
}

// the reduced grid's size
function reduced(full: number, factor: number): number {
  const f = Number.isFinite(factor) && factor >= 1 ? factor : 1;
  return Math.min(full, Math.max(8, Math.ceil(full / f)));
}

// whether a kind of light is accumulated
function accumulates(kind: string): boolean {
  return kind === "sky" || kind === "orb";
}

export const FogAccum = { jitter, alpha, blend, reduced, accumulates, FRAMES };

M.FogAccum = FogAccum;
