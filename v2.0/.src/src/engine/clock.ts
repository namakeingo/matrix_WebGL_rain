// The rain's steps in the simulation's time: STEP_RATE steps a second at first, a rate set by
// Speed. A new rate goes on from the step reached (the steps never jump back or ahead when it
// changes): the steps at a time are base + (time - from) x rate, base and from those of the last
// change. The rain and the splashes count their steps by it (a splash's stamp a step).
//
// Changelog:
// 2026-11-04: TypeScript, a module of src/engine/ (was engine/clock.js).
import { M } from "./core";

export class StepClock {
  from: number;
  base: number;
  rate: number;
  constructor(rate: number) {
    this.rate = rate;
    this.base = 0;
    this.from = 0;
  }

  // the steps at a time, with their fraction
  at(time: number) {
    return this.base + (time - this.from) * this.rate;
  }

  stepAt(time: number) {
    return Math.floor(this.at(time));
  }

  // the time a step starts
  timeOf(step: number) {
    return this.from + (step - this.base) / this.rate;
  }

  // the most steps one frame of the wallpaper's can move (its time at most M.MAX_GAP): more is a
  // jump in time (a reset, the tests'), never a frame
  get most() {
    return Math.ceil(M.MAX_GAP * this.rate) + 1;
  }

  // a new rate from a time on
  setRate(rate: number, time: number) {
    this.base = this.at(time);
    this.from = time;
    this.rate = rate;
  }

  // the steps from 0 again (the rate kept)
  reset() {
    this.base = 0;
    this.from = 0;
  }
}

M.StepClock = StepClock;
