// The shipped (Effect.lod on) front shade path's view change as a DELTA (Feature P1, story P8c; units.ui.shadedelta.ts; pure, importable in any thread). The shadow grid is fixed in the world and the cells of the boxes baked before are no
// older than one sweep, so a view change owes only the cells the new view's boxes add, and with a MARGIN around each baked box most parallax-sized moves owe nothing. A box is [first column, columns, rows, first row] (QualityFogShade.boxesFor's).
// - rectsOf(oldBox, newBox): the disjoint rectangles covering the cells of newBox that are not in oldBox (0 to 4: none when it is inside, the new box when they do not meet, one for a strip); cellsOf(rects); deltaOf(oldBoxes, newBoxes)
//   per draw; cellsIn(delta, layersPerDraw): the cells over every draw's layers
// - COST_US: the microseconds a worker takes for a cell (the measured 117 ms for 98,304 nodes); fits(cells, leadMs, workers): the delta's work cells COST_US is within 0.8 workers leadMs (integer arithmetic: no rounding at the boundary)
// - leadsView(state): the delta is asked ahead for a view change alone (no settings, jump, switch or size change) with the option, a lead over 0, warmed workers and a delta that fits
// - inlineStep(pending, nowMs, releaseMs, deadlineMs): nothing before the release; from it the first pending draw runs inline (one a call); after releaseMs + deadlineMs every pending draw is the GPU's
// - margin(leadS, reach): the box's margin { columns, rows } for the pose's travel over the lead (reach: yaw and pitch in radians, eyeX and eyeY in metres): columns = min(MAX_COLUMNS, ceil(yaw COLUMNS_PER_RAD + eyeX COLUMNS_PER_M)),
//   rows = min(MAX_ROWS, ceil(pitch ROWS_PER_RAD + eyeY ROWS_PER_M)); 0 at a lead of 0. COLUMNS_PER_RAD is (ACROSS - 1) / 2 / SPAN: a radian of yaw moves a read by about one unit of dx / (-dz), half the grid's width
//   in 63.5 columns; the others are a conservative few columns a metre of the eye and rows a radian of pitch; the caps keep the margin's steady cost under about 20% more cells
// - expand(box, margin): the box grown by the margin on every side, clipped to the grid (128 columns, 64 rows)
//
// Changelog:
// 2026-11-24: new (Feature P1, story P8c).
import { M } from "../engine/core";

const COST_US = 1.2;
const COLUMNS_PER_RAD = 63.5;
const COLUMNS_PER_M = 20;
const ROWS_PER_RAD = 20;
const ROWS_PER_M = 10;
const MAX_COLUMNS = 12;
const MAX_ROWS = 6;
const GRID_COLUMNS = 128;
const GRID_ROWS = 64;

function rectsOf(oldBox: number[], newBox: number[]): number[][] {
  const x0 = newBox[0]!, x1 = newBox[0]! + newBox[1]!, y0 = newBox[3]!, y1 = newBox[3]! + newBox[2]!;
  const ix0 = Math.max(x0, oldBox[0]!), ix1 = Math.min(x1, oldBox[0]! + oldBox[1]!), iy0 = Math.max(y0, oldBox[3]!), iy1 = Math.min(y1, oldBox[3]! + oldBox[2]!);
  if (newBox[1]! <= 0 || newBox[2]! <= 0) {
    return [];
  }
  if (ix0 >= ix1 || iy0 >= iy1) {
    return [newBox.slice()];
  }
  const out: number[][] = [];
  if (iy0 > y0) {
    out.push([x0, x1 - x0, iy0 - y0, y0]);
  }
  if (y1 > iy1) {
    out.push([x0, x1 - x0, y1 - iy1, iy1]);
  }
  if (ix0 > x0) {
    out.push([x0, ix0 - x0, iy1 - iy0, iy0]);
  }
  if (x1 > ix1) {
    out.push([ix1, x1 - ix1, iy1 - iy0, iy0]);
  }
  return out;
}

function cellsOf(rects: number[][]): number {
  let n = 0;
  for (const r of rects) {
    n += r[1]! * r[2]!;
  }
  return n;
}

function deltaOf(oldBoxes: number[][], newBoxes: number[][]): number[][][] {
  return newBoxes.map((box, k) => (oldBoxes[k] ? rectsOf(oldBoxes[k]!, box) : [box.slice()]));
}

function cellsIn(delta: number[][][], layersPerDraw: number): number {
  let n = 0;
  for (const rects of delta) {
    n += cellsOf(rects) * layersPerDraw;
  }
  return n;
}

// (cells x 1.2 us <= 0.8 workers lead ms, as cells x 12 <= 8000 workers lead ms)
function fits(cells: number, leadMs: number, workers: number): boolean {
  return cells * Math.round(COST_US * 10) <= 8000 * Math.max(0, workers) * Math.max(0, leadMs);
}

interface ViewState {
  option: boolean;
  delay: number;
  warmed: boolean;
  moved: boolean;
  settings: boolean;
  jump: boolean;
  switched: boolean;
  size: boolean;
  cells: number;
  workers: number;
}

function leadsView(s: ViewState): boolean {
  return s.option && s.delay > 0 && s.warmed && s.moved && !s.settings && !s.jump && !s.switched && !s.size && fits(s.cells, s.delay * 1000, s.workers);
}

function inlineStep(pending: number[], nowMs: number, releaseMs: number, deadlineMs: number): { inline: number | null; gpu: number[] } {
  if (nowMs < releaseMs || pending.length === 0) {
    return { inline: null, gpu: [] };
  }
  if (nowMs > releaseMs + deadlineMs) {
    return { inline: null, gpu: pending.slice() };
  }
  return { inline: pending[0]!, gpu: [] };
}

function margin(leadS: number, reach: { yaw: number; pitch: number; eyeX: number; eyeY: number }): { columns: number; rows: number } {
  if (!(leadS > 0)) {
    return { columns: 0, rows: 0 };
  }
  return {
    columns: Math.min(MAX_COLUMNS, Math.ceil(reach.yaw * COLUMNS_PER_RAD + reach.eyeX * COLUMNS_PER_M)),
    rows: Math.min(MAX_ROWS, Math.ceil(reach.pitch * ROWS_PER_RAD + reach.eyeY * ROWS_PER_M)),
  };
}

function expand(box: number[], m: { columns: number; rows: number }): number[] {
  // (a draw culled to an empty box stays culled: the margin grows boxes that exist)
  if (box[1]! <= 0 || box[2]! <= 0) {
    return box.slice();
  }
  const x0 = Math.max(0, box[0]! - m.columns), x1 = Math.min(GRID_COLUMNS, box[0]! + box[1]! + m.columns);
  const y0 = Math.max(0, box[3]! - m.rows), y1 = Math.min(GRID_ROWS, box[3]! + box[2]! + m.rows);
  return [x0, x1 - x0, y1 - y0, y0];
}

export const ShadeDelta = { COST_US, COLUMNS_PER_RAD, COLUMNS_PER_M, ROWS_PER_RAD, ROWS_PER_M, MAX_COLUMNS, MAX_ROWS, rectsOf, cellsOf, deltaOf, cellsIn, fits, leadsView, inlineStep, margin, expand };

M.ShadeDelta = ShadeDelta;
