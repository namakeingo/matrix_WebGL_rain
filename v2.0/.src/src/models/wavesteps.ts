// WaveSteps: the waves' step and what follows from the stability constant. The waves are a stepped wave equation on a grid of ACROSS x DOWN cells; the
// scheme is stable while cdt^2 (1/a^2 + 1/d^2) <= 1 (cdt: the way a step goes in metres, a and d: a cell's width and depth), checked on the nearest row, whose
// cells are the smallest. The step goes as far as STABLE of that limit: STABLE_REF (the earlier physics) or, as a level of detail, STABLE (fewer steps a
// second, the speed the same). The wave speed is fixed by construction: the steps a second are SPEED / cdt at Ripples speed 75 (models/ripplespeed.ts scales
// it), so a longer step means fewer steps. The edge loss a step (EDGE_LOSS at STABLE_REF) is proportional to cdt: the loss per metre stays. Pure: no GL, no page.
//
// Changelog:
// 2026-11-08: new (STABLE 0.8 as the level of detail's constant, STABLE_REF 0.45 the earlier one).
import { M } from "../engine/core";

const ACROSS = 2048;
const DOWN = 1024;
// the waves' speed at Ripples speed 75 (m/s)
const SPEED = 0.25;
// the share of the stability limit a step uses: with the level of detail, and without it (the earlier value)
const STABLE = 0.8;
const STABLE_REF = 0.45;
// the cells along each side where the waves die out, and the most they lose a step there at STABLE_REF
const EDGE = 32;
const EDGE_LOSS = 0.1;

// the way a step goes (m) from the nearest cells' sizes
function cdtFor(near: number, far: number, span: number, stable: number = STABLE): number {
  const across = (near * 2 * span) / ACROSS;
  const down = (near * near * (1 / near - 1 / far)) / DOWN;
  return Math.sqrt(stable / (1 / (across * across) + 1 / (down * down)));
}

// the steps a second at Ripples speed 75
function rateFor(cdt: number): number {
  return SPEED / cdt;
}

// the edge loss a step: proportional to the step's way, so the loss per metre does not change with the constant
function edgeLossFor(near: number, far: number, span: number, stable: number = STABLE): number {
  return (EDGE_LOSS * cdtFor(near, far, span, stable)) / cdtFor(near, far, span, STABLE_REF);
}

export const WaveSteps = { ACROSS, DOWN, SPEED, STABLE, STABLE_REF, EDGE, EDGE_LOSS, cdtFor, rateFor, edgeLossFor };

M.WaveSteps = WaveSteps;
