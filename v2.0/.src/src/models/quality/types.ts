// The quality system's shared types and constants (pure: no GL, no page, importable in any thread). An effect's
// quality for a frame is an EffectQuality: whether it is seen at all, its level (0 hidden, QUALITY_LEVELS full: 41
// steps, about one for each metre of the scene's 40 m) and, for the effects made of units (drops, splashes, strike
// pieces, grid blocks, fog slices), which units are hidden and the level of each one drawn. The quality workers
// fill them from the units' positions of the frame about to be drawn; the effects only read them.
//
// Changelog:
// 2026-11-06: new (the contract of Effect.quality()).

// the highest level (full quality); level 0 is hidden
import type { QualityInputs } from "./unit";

export const QUALITY_LEVELS = 40;

// the share of a unit's contribution under which it is invisible (1/255: one level of an 8 bit channel)
export const INVISIBLE = 1 / 255;

// one effect's quality for the frame
export interface EffectQuality {
  // false: nothing of the effect is seen (its update, draws and bakes are skipped)
  visible: boolean;
  // 0 to QUALITY_LEVELS for the effect as a whole (the highest level of any unit drawn, or its own level when it has no units)
  level: number;
  // how many units it has (0: it is not made of units) and how many are not hidden
  units: number;
  drawn: number;
  // the mean level over the units drawn (the effect's level when it has no units)
  meanLevel: number;
  // per unit: 1 hidden (null: none hidden)
  hidden: Uint8Array | null;
  // per unit: its level 0 to QUALITY_LEVELS (null: every unit drawn is at `level`)
  levels: Uint8Array | null;
}

// the frame's view every effect's job parameters are made from (index.ts fills it once a frame, in place, after the camera is updated):
// the simulation's step and time, and the inputs of the quality model (camera matrices, fog, water, the text's occluders). An effect
// reads it and never changes it; its own camera, clock and state give the rest.
// (the model's inputs without the units' own arrays, which a job fills from its units)
export type QualityViewInputs = Omit<QualityInputs, "xs" | "ys" | "zs" | "radii">;
export interface QualityShared {
  step: number;
  time: number;
  inputs: QualityViewInputs;
}

// what an effect asks the pool to process each frame: its unit count and the least chunk worth a task
export interface QualityJob {
  // the effect's index in the effects' order
  effect: number;
  units: number;
  minChunk: number;
}

// one task of the pool's flat list: a range of one effect's units
export interface QualityTask {
  effect: number;
  from: number;
  to: number;
}

// a line of the Performance readout for one effect class (never one per instance)
export interface QualityEffectLine {
  name: string;
  // the noun for its units in the readout (the effect class's QUALITY_UNIT)
  unit: string;
  units: number;
  drawn: number;
  meanLevel: number;
  // what the effect did with the levels this frame, in words, after the numbers on its line (SupportReadout.noteOf): lists used, slices held, passes skipped
  note?: string;
}

// the pool's line of the Performance readout
export interface QualityPoolReport {
  workers: number;
  // the time the pool took for the frame, and the time the render thread waited for it (ms)
  ms: number;
  waitedMs: number;
  // the frames that used the last result because the workers were late
  late: number;
  // the workers that died and were made again (absent: none counted)
  restarts?: number;
  mode: "shared" | "transfer" | "none";
}

export interface QualityReport {
  effects: QualityEffectLine[];
  pool: QualityPoolReport;
}
