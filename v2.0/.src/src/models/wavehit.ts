// WaveHit: the rules that decide where the water's march over the waves (the "wave hit": a crest hides the water behind it and moves what is seen) is worth its cost. Pure: no GL, no page,
// importable in any thread.
// A crest of height h at a distance D (metres along the ground from the eye) moves the picture by shiftPx = h f / D pixels (f the focal length in pixels: height / 2 / tan(half the field of view),
// 2,316 for a picture 2,160 px tall). Under THRESHOLD_PX (1 px) it moves nothing the eye can see, so the march is left out there.
// - shiftPx(height, distance, focal): the shift in pixels (0 for a distance of 0 or under).
// - reach(height, focal, threshold): the distance within which a crest of `height` shifts the picture by at least `threshold` pixels: height f / threshold.
// - rowsBelowHorizon(eyeHeight, height): the rows (pixels, level view) below the horizon from which a crest of `height` shifts at least 1 px: eyeHeight / height (Infinity for a height of 0 or
//   under). A row n px below the horizon meets the flat ground at H f / n, where the shift is h n / H.
// - globalOn(highest, nearest, focal, threshold): the global gate: the highest crest at the nearest water shifts the picture by at least `threshold` (false for no crest).
// - blockNeeds(top, distance, focal, threshold): the per-block gate: a block whose top is `top` at `distance` shifts the picture by at least `threshold`.
// - hitDistance(flatDistance, eyeHeight, plateau): along a ray whose flat-plane hit is at flatDistance = H / -d.y, the hit of a plateau of height h: (H - h) / -d.y = flatDistance (1 - h / H).
// shaders/water/fragment.glsl is the shader's twin of the arithmetic.
//
// Changelog:
// 2026-11-13: new.
import { M } from "../engine/core";

const THRESHOLD_PX = 1;

function shiftPx(height: number, distance: number, focal: number): number {
  return distance > 0 ? (height * focal) / distance : 0;
}

function reach(height: number, focal: number, thresholdPx: number = THRESHOLD_PX): number {
  return (height * focal) / thresholdPx;
}

function rowsBelowHorizon(eyeHeight: number, height: number): number {
  return height > 0 ? eyeHeight / height : Infinity;
}

function globalOn(highest: number, nearest: number, focal: number, thresholdPx: number = THRESHOLD_PX): boolean {
  return highest > 0 && shiftPx(highest, nearest, focal) >= thresholdPx;
}

function blockNeeds(top: number, distance: number, focal: number, thresholdPx: number = THRESHOLD_PX): boolean {
  return shiftPx(top, distance, focal) >= thresholdPx;
}

function hitDistance(flatDistance: number, eyeHeight: number, plateau: number): number {
  return flatDistance * (1 - plateau / eyeHeight);
}

export const WaveHit = { THRESHOLD_PX, shiftPx, reach, rowsBelowHorizon, globalOn, blockNeeds, hitDistance };

M.WaveHit = WaveHit;
