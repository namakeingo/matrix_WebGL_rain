// WaveLift: where a drop, a splash and a bolt's foot meet the water, they meet its LIVE surface, not y = 0 (the vertex shaders read the wave height at the place every frame and add it;
// this is their rule in the script). Pure: no GL, no page, importable in any thread.
// - reach(highest, cell, on): the metres over the floor the lift fades over: 0 when the waves are off (Ripples or the Collision plane off: the water is calm and flat) or the highest wave
//   is under CALM; else the highest wave plus one cell, so the cells over the crest bend over it by less than a cell's height and no row folds (the heaviest settings give waves of up to
//   0.21 m, 7 cells: a lift fading over one row would fold the trail).
// - share(above, reach): 1 at the floor (and under it), 0 at the reach and over it, linear between; 0 for no reach.
// - lift(h, above, reach) = h x share: the wave height h (negative in a trough) at the cell's place times the share at the cell's height over the floor. y = above + lift is strictly
//   increasing in `above` while |h| <= highest, so the rows keep their order. The landing's instant (the head reaching y = 0) is not moved: it is off the wave's by at most h over the
//   fall speed.
// - CALM: the highest wave (m) under which the water counts as calm (effects/waves.ts's calm flag reads the same threshold): a crest that low moves no pixel.
// shaders/waves/lift.glsl is the shaders' twin.
//
// Changelog:
// 2026-11-12: new.
import { M } from "../engine/core";

const CALM = 1e-5;

function reach(highest: number, cell: number, on: boolean): number {
  return on && highest >= CALM ? highest + cell : 0;
}

function share(above: number, reachOver: number): number {
  return reachOver > 0 ? Math.min(1, Math.max(0, 1 - above / reachOver)) : 0;
}

function lift(h: number, above: number, reachOver: number): number {
  return h * share(above, reachOver);
}

export const WaveLift = { CALM, reach, share, lift };

M.WaveLift = WaveLift;
