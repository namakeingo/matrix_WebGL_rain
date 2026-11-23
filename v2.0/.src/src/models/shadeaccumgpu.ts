// ShadeAccumGpu: the pure pieces of the shade grid's accumulation on the GPU (Feature U2, story V2; no GL, no page, importable in any thread). The GL half is engine/shadeaccum.ts.
// Each frame that accumulates bakes a reduced, jittered set of the FRONT grid's cells (FRESH, an eighth of them), blends it into the held grid at alpha 1 / FRAMES and stores the result into the front layers
// [0, FRONT_LAYERS) of the shade texture; the base layers (BASE_FIRST..LAYERS - 1) are never written. Every change that restarts the average (M.ShadeAccum.resets, a gap in time) is an EXACT bake of the whole grid.
// - FRONT_LAYERS, BASE_FIRST, LAYERS: the shade texture's layers (the front grid's, then the base mist's); FRESH: the reduced grid [across, up, deep] of the fresh texture (M.ShadeAccum.reducedGrid).
// - nodeCoord(j, n, r, jit): the full grid's index coordinate of the reduced node j of r on an axis of n cells (M.ShadeAccum.nodeAt): the place the fresh bake takes the node's value at.
// - readCoord(i, n, r, jit): the reduced lattice coordinate the blend reads the fresh grid at for the full cell i: (i + 1/2) r / n - jit (trilinear, clamped to [0, r - 1] by the sampler).
// - storePlan(perDraw): the draws of the blend and the store, perDraw layers each, covering the front layers once and no other layer.
// - exactBake(draws): { from 0, to draws, inView false }: the exact bake covers every layer and every cell (no culling to the view's boxes).
// - Schedule.frame(change, passed): { exact, alpha, jitter }: the first frame, and a frame with M.ShadeAccum.resets(change) or jumped(passed), is exact (alpha 1, jitter 0, the average restarts); any other accumulates at alpha
//   FogAccum.alpha(FRAMES, FRAMES) with the jitter index counted from 0 after the exact bake. event(kind) owes nothing: a strike's shadow grids are not accumulated (M.ShadeAccum.accumulates).
//
// Changelog:
// 2026-11-22: new (Feature U2, story V2).
import { M } from "../engine/core";
import { FogAccum } from "./fogaccum";
import { ShadeAccum } from "./shadeaccum";

const FRONT_LAYERS = 96;
const BASE_FIRST = 96;
const LAYERS = 192;
const FULL = [128, 64, 96];
const FRESH = ShadeAccum.reducedGrid(FULL[0]!, FULL[1]!, FULL[2]!, ShadeAccum.FACTOR);

interface Change {
  settings?: boolean;
  jump?: boolean;
  moved?: boolean;
  switched?: boolean;
  size?: boolean;
}

function nodeCoord(j: number, n: number, r: number, jit: number): number {
  return ShadeAccum.nodeAt(j, n, r, jit);
}

function readCoord(i: number, n: number, r: number, jit: number): number {
  return ((i + 0.5) * r) / n - jit;
}

function storePlan(perDraw: number): { from: number; to: number }[] {
  const per = Math.max(1, Math.floor(perDraw));
  const plan: { from: number; to: number }[] = [];
  for (let from = 0; from < FRONT_LAYERS; from += per) {
    plan.push({ from, to: Math.min(FRONT_LAYERS, from + per) });
  }
  return plan;
}

// the exact bake's draws of a grid of `draws` framebuffers: every draw, each over the whole grid (inView false: no scissor to the cells the view reads). The accumulating frames blend the whole reduced grid in everywhere,
// so an exact bake that left cells out would leave history in them and make the grid depend on what ran before
function exactBake(draws: number): { from: number; to: number; inView: boolean } {
  return { from: 0, to: draws, inView: false };
}

class Schedule {
  frames = 0;
  exactBakes = 0;
  accumulations = 0;
  private started = false;

  frame(change: Change, passed: number): { exact: boolean; alpha: number; jitter: number } {
    if (!this.started || ShadeAccum.resets(change) || ShadeAccum.jumped(passed)) {
      this.started = true;
      this.frames = 0;
      this.exactBakes++;
      return { exact: true, alpha: 1, jitter: 0 };
    }
    const jitter = this.frames++;
    this.accumulations++;
    return { exact: false, alpha: FogAccum.alpha(FogAccum.FRAMES, FogAccum.FRAMES), jitter };
  }

  // a kind of light that is not accumulated, or one that is not known, owes nothing
  event(kind: string): void {
    void kind;
  }

  // the next frame is an exact bake (the option switched on, the tests' refresh)
  restart(): void {
    this.started = false;
  }
}

export const ShadeAccumGpu = { FRONT_LAYERS, BASE_FIRST, LAYERS, FRESH, nodeCoord, readCoord, storePlan, exactBake, Schedule };

M.ShadeAccumGpu = ShadeAccumGpu;
