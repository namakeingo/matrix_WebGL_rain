// RippleSpeed: the waves' speed from the Ripples speed setting (10 to 300, default 75 = 0.25 m/s):
// value / 75 x 0.25 m/s. The waves are a stepped wave equation whose way a step (c dt) is fixed by
// the grid's cells (stability), so the speed is the number of steps a second: the base rate (the
// rate at 75) times value / 75. The damping per step keeps 99% lost in Ripples duration in seconds
// whatever the rate. Pure: no GL, no page.
//
// Changelog:
// 2026-11-05: new.
import { M } from "../engine/core";

const BASE = 0.25;
const DEFAULT = 75;
const MIN = 10;
const MAX = 300;

// the waves' speed (m/s)
function speedFor(value: number): number {
  return (BASE * value) / DEFAULT;
}

// the steps a second: the base rate at the default, scaled with the value
function stepsPerSecond(value: number, baseRate: number): number {
  return baseRate * (value / DEFAULT);
}

// the whole steps of a time at a rate and the time left over; at most `most` steps unless all
// (the time over it let go)
function stepsIn(seconds: number, rate: number, most: number, all: boolean): { steps: number; left: number } {
  const time = Math.max(0, seconds);
  let steps = Math.floor(time * rate);
  let left = time - steps / rate;
  if (!all && steps > most) {
    steps = most;
    left = 0;
  }
  return { steps, left };
}

// the damping each step: 0.01 (99% lost) over the duration in seconds
function dampPerStep(duration: number, rate: number): number {
  return Math.pow(0.01, 1 / (duration * rate));
}

export const RippleSpeed = { BASE, DEFAULT, MIN, MAX, speedFor, stepsPerSecond, stepsIn, dampPerStep };

M.RippleSpeed = RippleSpeed;
