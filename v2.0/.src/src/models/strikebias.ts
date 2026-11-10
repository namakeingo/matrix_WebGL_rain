// StrikeBias: Lightning front bias as a pure function, with no GL and no page.
// - biasedUnit(unit, bias): a strike's distance draw (a unit in 0 to 1, the argument of
//   Rain.distanceAt: a smaller unit is a nearer strike) raised to 1 + FRONT_POWER x bias / 100.
//   A bigger exponent pulls the draws to 0, so strikes fall nearer the front; bias 0 is the
//   exponent 1, which returns the unit as it is (the same draws, the same strikes).
// - FRONT_POWER: the exponent's growth over the bias 0 to 100 (4: at bias 100 about 57% of the
//   strikes over 2.5 to 40 m fall in the nearest fifth, against 6% at 0).
//
// Changelog:
// 2026-11-05: new, for Lightning front bias.
import { M } from "../engine/core";

const FRONT_POWER = 4;

const biasedUnit = (unit: number, bias: number) => (bias > 0 ? Math.pow(unit, 1 + (FRONT_POWER * bias) / 100) : unit);

export const StrikeBias = { FRONT_POWER, biasedUnit };

M.StrikeBias = StrikeBias;
