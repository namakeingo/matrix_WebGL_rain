// The banded cyclic accumulation as a pure model (Feature P1, story P8b; units.ui.shadebands.ts; no GL, no page, importable in any thread). The front shade grid's fresh reduced grid is not one job a frame but one BAND a frame, in a
// cycle over the grid: each frame asks the band after the last one (B core layers), a lead ahead, and its output is blended into the held layers it covers only. Nothing here knows about the shade grid: `total` is the number of items
// of the pass (the shade grid's 48 reduced layers; the front volume's slices or rows would do the same).
// - cycle(total, band) = ceil(total / band): the frames of one pass over the items
// - bandAt(frame, total, band) -> { cycle, k, core: [a, b), from, to }: the frame's band: the core [a, b) = [(frame mod cycle) band, min(total, a + band)), the uploaded items [from, to) = the core with one guard item each side (clipped to
//   [0, total]: the blend reads the fresh grid trilinearly between two neighbours, and a jitter under one item moves the read by less than one), the cycle number and k = the cycle number (the jitter index every band of a pass shares)
// - heldOf(core, perReduced) -> [h0, h1): the held items a band blends and stores: [core[0] perReduced, core[1] perReduced)
// - resets(change, leads): M.ShadeAccum.resets(change), except that on the worker path (leads true) `moved` owes nothing (the grid is fixed in the world and every frame covers every cell, so a view change leaves no cell stale)
// - alphaBand(): the blend's weight of one update of an item, 1 / FogAccum.FRAMES (the shipped sweep's own staleness class: an item is updated once a pass)
//
// Changelog:
// 2026-11-24: new (Feature P1, story P8b).
import { M } from "../engine/core";
import { FogAccum } from "./fogaccum";
import { ShadeAccum } from "./shadeaccum";

export interface ShadeBand {
  cycle: number;
  k: number;
  core: number[];
  from: number;
  to: number;
}

interface Change {
  settings?: boolean;
  jump?: boolean;
  moved?: boolean;
  switched?: boolean;
  size?: boolean;
}

function cycle(total: number, band: number): number {
  return Math.ceil(total / Math.max(1, band));
}

function bandAt(frame: number, total: number, band: number): ShadeBand {
  const size = Math.max(1, Math.floor(band)), c = cycle(total, size), index = ((frame % c) + c) % c, a = index * size, b = Math.min(total, a + size);
  return { cycle: Math.floor(frame / c), k: Math.floor(frame / c), core: [a, b], from: Math.max(0, a - 1), to: Math.min(total, b + 1) };
}

function heldOf(core: number[], perReduced: number): number[] {
  return [core[0]! * perReduced, core[1]! * perReduced];
}

function resets(change: Change, leads: boolean): boolean {
  return ShadeAccum.resets(leads ? { ...change, moved: false } : change);
}

function alphaBand(): number {
  return FogAccum.alpha(FogAccum.FRAMES, FogAccum.FRAMES);
}

export const ShadeBands = { cycle, bandAt, heldOf, resets, alphaBand };

M.ShadeBands = ShadeBands;
