// WaveLift: where a splash and a bolt's foot start, they start on the water's LIVE surface, not y = 0 (the vertex shaders read the wave height at the place every frame and add it; this is
// their rule in the script), and where a rain drop's fall ends (its head meets the surface) is told to the wheel in whole rows. Pure: no GL, no page, importable in any thread.
// - reach(highest, cell, on): the metres over the floor the splashes' and the bolt's lift is read over: 0 when the waves are off (Ripples or the Collision plane off: the water is calm and
//   flat) or the highest wave is under CALM; else the highest wave plus one cell.
// - CALM: the highest wave (m) under which the water counts as calm (effects/waves.ts's calm flag reads the same threshold): a crest that low moves no pixel.
// - A drop is never moved to meet the water (it keeps its path and its speed): its fall ENDS when its head meets the surface at the landing's place, a crest EARLIER, a trough LATER (the
//   head going on below the floor). rowsOf(h, cell, cap) is that rule in whole rows: the surface's height over the floor in rows, round(h / cell) as the gather shader works it out
//   (floor(h / cell + 0.5): a wave under half a row, 1.5 cm, meets the floor's row), capped at +-cap (CAP_ROWS: the heaviest settings' crests are 7 rows, measured 21 cm). The wheel
//   (models/rainwheel.ts) reads the rows from a table of bytes, rows + BIAS.
// - BIAS, STRIDE: a drop's entry in the table the gather pass makes and the wheel reads (4 bytes: the rows of the fall now + BIAS, the rows of the fall before + BIAS, the fall's low byte,
//   0); the table's byte for a surface of `rows` rows is rows + BIAS (0 to 2 BIAS at the cap).
// shaders/waves/lift.glsl is the shaders' twin (the splashes' and the bolt's reads); shaders/rain/gather.glsl the rain's.
//
// Changelog:
// 2026-11-12: the rain's lift (share, lift) gone: a drop meets the water by its life; rowsOf, CAP_ROWS, BIAS, STRIDE.
// 2026-11-12: new.
import { M } from "../engine/core";

const CALM = 1e-5;
// the most rows the surface is taken to be over or under the floor: the heaviest settings' waves reach 21 cm, 7 rows of 3 cm
const CAP_ROWS = 8;
// the table's byte for a surface of r rows is r + BIAS, and its bytes a drop
const BIAS = CAP_ROWS;
const STRIDE = 4;

function reach(highest: number, cell: number, on: boolean): number {
  return on && highest >= CALM ? highest + cell : 0;
}

// the surface of height h over the floor, in whole rows of `cell` metres (negative in a trough), capped
function rowsOf(h: number, cell: number, cap: number): number {
  return Math.max(-cap, Math.min(cap, Math.floor(h / cell + 0.5)));
}

export const WaveLift = { CALM, CAP_ROWS, BIAS, STRIDE, reach, rowsOf };

M.WaveLift = WaveLift;
