// QualityLightning: the strikes' light cast for the quality model, pure: no GL, no page, runs in any thread. The units are the strike slots
// (M.STRIKES_MOST); a slot's level is the light it casts now (Lightning.light, 0 for a slot with no strike). A slot is hidden (0) when what
// the fog and the water can show of it is under one level of 255, QUALITY_LEVELS otherwise (nothing is lowered by level: the strikes' bakes
// are made once at the strike's peak, where no coarser walk has a bound).
// The bound, per unit of level:
//   - the emitter's light e at any place is at most EMITTER_MAX = 2 pi EMISSION / NEAREST: a line light at the clamped nearest distance
//     gives pi EMISSION / NEAREST, and the worst bend of a jagged channel 1.4 times that (probed over every vertex of many strikes);
//   - the fog's light from it is e x the Henyey-Greenstein phase (PHASE_MAX, the forward peak at PHASE_G) x the albedo share (<= 1) x the
//     slices' weights, which sum to 1 - transmittance <= 1 (STRIKE_SCALE cancels); the water's is e x WATER_DIFFUSE / PI; both times the
//     brightest channel of the strikes' tint (BOLT_MAX);
//   - what shows is under 1/255 where the radiance is under RADIANCE_CUT = (1/255) / (the exposure's greatest gain x the tone curve's
//     steepest slope), the fog tail's own constants.
// So the slot is hidden when level < LEVEL_CUT = RADIANCE_CUT / GAIN. A strike's level falls to BLACK_RADIANCE x F at its end (F = 40 / focal
// metres): over LEVEL_CUT up to 2160 rows, so the cut acts only on larger views (3 to 6% of a strike at 4320 rows). Each unit depends only
// on its own level: any split of a range gives the whole's levels.
//
// Changelog:
// 2026-11-07: new.
import { M } from "../../engine/core";
import { BOLT } from "../../materials/bolt";
import { PHASE_G } from "../../materials/fog";
import { WATER_DIFFUSE } from "../../materials/water";
import { Flash } from "../flash";
import { QualityFog } from "./fog";
import { QualityJobs } from "./jobs";
import { QUALITY_LEVELS } from "./types";
import type { QualityStatics, QualityParams } from "./jobs";

// the emitter's greatest light at a place, per unit of level
const EMITTER_MAX = (2 * Math.PI * Flash.EMISSION) / Flash.NEAREST;
// the Henyey-Greenstein phase's forward peak at PHASE_G, 0.5% over
const PHASE_MAX = ((1 - PHASE_G * PHASE_G) / (4 * Math.PI * Math.pow(1 - PHASE_G, 3))) * 1.005;
const WATER_GAIN = WATER_DIFFUSE / Math.PI;
const BOLT_MAX = Math.max(BOLT[0], BOLT[1], BOLT[2]);
// the radiance under which a pixel's change is under 1/255 (exposure's gain and the tone curve's slope as the fog's tail bound)
const RADIANCE_CUT = 1 / 255 / (QualityFog.TAIL_EXPOSURE * QualityFog.TAIL_SLOPE);
// the greatest radiance per unit of level, and the level under which a slot shows nothing
const GAIN = EMITTER_MAX * BOLT_MAX * Math.max(PHASE_MAX, WATER_GAIN);
const LEVEL_CUT = RADIANCE_CUT / GAIN;

export interface LightningQualityParams {
  levels: ArrayLike<number>;
}

// whether a slot's light now can show
function visible(level: number): boolean {
  return level >= LEVEL_CUT;
}

// units from..to-1: 0 hidden, QUALITY_LEVELS shown
function process(statics: QualityStatics, params: LightningQualityParams, from: number, to: number, out: Uint8Array): void {
  for (let i = from; i < to; i++) {
    out[i] = visible(params.levels[i]) ? QUALITY_LEVELS : 0;
  }
}

QualityJobs.register("lightning", process as unknown as (statics: QualityStatics, params: QualityParams, from: number, to: number, out: Uint8Array) => void);

export const QualityLightning = { QUALITY_LEVELS, EMITTER_MAX, PHASE_MAX, WATER_GAIN, BOLT_MAX, RADIANCE_CUT, GAIN, LEVEL_CUT, visible, process };

M.QualityLightning = QualityLightning;
