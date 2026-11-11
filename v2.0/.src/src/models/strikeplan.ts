// StrikePlan: the next strikes of the lightning planned, as a pure function (no GL, no page: it runs in a worker too, workers/strikeplanworker.ts). Its input carries all its state:
// the random number generator's (Mulberry's `a`), the time of the last strike planned, the time now and the settings; its output is the strikes, the time of the last planned, the
// strikes counted past and the generator's state after, so that a worker needs nothing handed over and a lost one is simply asked again.
// The draws are made in the order Lightning.plan always made them: a wait (-ln(1 - r) x the mean time between strikes), the distance (Rain.distanceAt of the front-biased unit, over
// the rain's distances), the place across the view, the playing time (a draw only when the shortest differs from the longest), the strike's seed, its flicker periods and its
// branches'. A strike that would be over before `time` is not accepted (counted in `past`) and the loop goes on until `count` are accepted.
//
// Changelog:
// 2026-11-10: new, from Lightning.plan.
import { M, Mulberry } from "../engine/core";

export interface StrikePlanInput {
  // the generator's state, the time of the last strike planned (s), the time now (s), the number of strikes wanted
  rng: number;
  planned: number;
  time: number;
  count: number;
  // the settings: the mean time between strikes (s), the playing times (s), the front bias (0 to 100), the rain's distances (null: the defaults below), and the defaults and the span
  frequency: number;
  shortest: number;
  longest: number;
  frontBias: number;
  range: number[] | null;
  nearest: number;
  furthest: number;
  span: number;
}

export interface PlannedStrike {
  start: number;
  duration: number;
  seed: number;
  periods: number;
  branchPeriods: number;
  x: number;
  z: number;
}

export interface StrikePlanOutput {
  strikes: PlannedStrike[];
  planned: number;
  past: number;
  rng: number;
}

function plan(input: StrikePlanInput): StrikePlanOutput {
  const rng = new Mulberry(0);
  rng.a = input.rng;
  const longest = Math.max(input.shortest, input.longest);
  let planned = input.planned;
  let past = 0;
  const strikes: PlannedStrike[] = [];
  while (strikes.length < input.count) {
    planned += -Math.log(1 - rng.next()) * input.frequency;
    const range = input.range;
    const distance = M.Rain.distanceAt(M.StrikeBias.biasedUnit(rng.next(), input.frontBias), range ? range[0] : input.nearest, range ? range[1] : input.furthest);
    const x = (rng.next() * 2 - 1) * distance * input.span;
    const duration = input.shortest < input.longest ? input.shortest + (input.longest - input.shortest) * rng.next() : input.longest;
    const seed = Math.floor(rng.next() * 4294967296);
    const periods = 3 + Math.floor(rng.next() * 4);
    const branchPeriods = 3 + Math.floor(rng.next() * 4);
    if (planned + longest < input.time) {
      past++;
      continue;
    }
    strikes.push({ start: planned, duration, seed, periods, branchPeriods, x, z: -distance });
  }
  return { strikes, planned, past, rng: rng.a };
}

export const StrikePlan = { plan };

M.StrikePlan = StrikePlan;
