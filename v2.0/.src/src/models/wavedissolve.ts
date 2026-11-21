// WaveDissolve: the dithered dissolve of 1 s at a switch of the waves' grid. For the second after a switch the picture the water reads is, cell by cell, either the frozen old state
// (the state at the switch, resampled to the new grid) or the new state, which goes on simulating: a cell shows the old value while its threshold is at or above the mix and the new
// value once the mix has risen over it, so each cell switches once and no cell is ever a blend of two heights. The mix rises from 0 to 1 over DURATION seconds; at 1 the dissolve ends and the
// water reads the new state's own texture again, which is exactly the picture without the feature. Pure: no GL, no page; the time is given as each frame's dt.
//
// The threshold of a cell is the 8 x 8 ordered-dither (Bayer) matrix, (level + 0.5) / 64, by the cell's coordinates in the picture the pass draws: B2 = [[0, 2], [3, 1]] and
// B2n(x, y) = 4 Bn(x mod n, y mod n) + B2(x div n, y div n). Every aligned block holds the 64 levels once, so the share of cells switched at a mix m is m to within 1/128. Its values are
// exact in single precision, so the shader's test (threshold >= mix, in floats) selects the same cells as `selectsOld` at any mix a float holds exactly.
//
// A frame counts for at most MAX_FRAME seconds (a pause is never caught up), as the simulation's own clock does.
//
// Changelog:
// 2026-11-20: new (Feature S1, story S4.3b).
import { M } from "../engine/core";

const DURATION = 1;
const MAX_FRAME = 0.25;
// the run ends within a rounding of DURATION (twenty-four frames of 1/24 s add up to a hair under 1)
const END_TOLERANCE = 1e-9;
// B2 by (y, x)
const B2 = [
  [0, 2],
  [3, 1],
];

export class WaveDissolve {
  static DURATION = DURATION;
  static MAX_FRAME = MAX_FRAME;
  // whether a dissolve is running, the seconds it has run, and a mix the tests hold it at (null: the clock's)
  active: boolean;
  elapsed: number;
  hold: number | null;

  constructor() {
    this.active = false;
    this.elapsed = 0;
    this.hold = null;
  }

  // the mix: 0 at the start to 1 at DURATION; 1 when no dissolve runs
  get mix(): number {
    if (!this.active) {
      return 1;
    }
    if (this.hold !== null) {
      return this.hold;
    }
    return Math.min(Math.max(this.elapsed / DURATION, 0), 1);
  }

  // a dissolve begins (or begins again) from mix 0
  start() {
    this.active = true;
    this.elapsed = 0;
  }

  // dt seconds later: the clock moves on by dt clamped to [0, MAX_FRAME]; at DURATION the dissolve ends (a held mix stops the clock)
  advance(dt: number) {
    if (!this.active || this.hold !== null) {
      return;
    }
    this.elapsed += Math.min(Math.max(dt, 0), MAX_FRAME);
    if (this.elapsed >= DURATION - END_TOLERANCE) {
      this.active = false;
    }
  }

  stop() {
    this.active = false;
    this.hold = null;
  }

  // the level (0 to 63) of the 8 x 8 matrix at a cell: the coordinates' bits from the lowest, each pair's B2 digit one place further down
  static level(x: number, y: number): number {
    let v = 0;
    for (let k = 0; k < 3; k++) {
      v = v * 4 + B2[(y >> k) & 1]![(x >> k) & 1]!;
    }
    return v;
  }

  static threshold(x: number, y: number): number {
    return (WaveDissolve.level(x, y) + 0.5) / 64;
  }

  // a cell shows the old state at this mix
  static selectsOld(x: number, y: number, mix: number): boolean {
    return WaveDissolve.threshold(x, y) >= mix;
  }

  // the model of the pass: the old cell where selectsOld, else the new one (across x down cells, row by row)
  static select(oldCells: Float32Array, newCells: Float32Array, across: number, down: number, mix: number): Float32Array {
    const out = new Float32Array(across * down);
    for (let j = 0; j < down; j++) {
      for (let i = 0; i < across; i++) {
        const k = j * across + i;
        out[k] = WaveDissolve.selectsOld(i, j, mix) ? oldCells[k]! : newCells[k]!;
      }
    }
    return out;
  }
}

M.WaveDissolve = WaveDissolve;
