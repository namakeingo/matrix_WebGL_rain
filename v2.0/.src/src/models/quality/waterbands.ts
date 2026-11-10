// QualityWaterBands: which of the guard's bands of rows of the water pass hold no water, pure: no GL, no page.
// A pixel is water when its ray from the eye points down (the shader's `d.y < 0`, d = rayOf(gl_FragCoord.xy), the pixel's centre); the
// sign of d.y depends on the row only (not the column or the width): d.y has the sign of (height / 2 - py) / focal cos(pitch) + sin(pitch),
// py the centre's row from the top. A pixel above the horizon gets, from the water program, SKY * fog.a + fog.rgb with the fog read at the
// pixel to FOG_FAR and the strikes' share as the second output: nothing of the waves, the reflection or the strike grids, and no derivative
// is used by it, so the sky-only program (Water.skyFragment: the water's source without the water's parts) draws the same values there.
// A band is drawn with it when every one of its rows lies above the last row that holds water by MARGIN_ROWS rows more (against float32
// rounding of d.y at the horizon); a band that holds the horizon is drawn with the full program. Rows count from the bottom (gl_FragCoord.y
// - 0.5), as Quad.drawTiled's bands do: from 0, tile rows each, the last one shorter.
//
// Changelog:
// 2026-11-08: new.
import { M } from "../../engine/core";

// rows above the last water row kept with the full program
const MARGIN_ROWS = 1;

interface BandsView {
  height: number;
  horizonY(): number;
}
interface Band {
  from: number;
  to: number;
  sky: boolean;
}

// the highest row (from the bottom) whose centre is under the horizon, -1 when none
function lastWaterRow(view: BandsView): number {
  const last = Math.ceil(view.height - view.horizonY() - 0.5) - 1;
  return Math.max(-1, Math.min(view.height - 1, last));
}

// the first row from which a band may be sky only
function skyFrom(view: BandsView): number {
  return Math.min(view.height, Math.max(0, lastWaterRow(view) + 1 + MARGIN_ROWS));
}

// the guard's partition of the rows into bands of tile rows, each marked sky only or not
function bands(view: BandsView, tile: number): Band[] {
  const out: Band[] = [];
  const first = skyFrom(view);
  for (let y = 0; y < view.height; y += tile) {
    out.push({ from: y, to: Math.min(y + tile, view.height), sky: y >= first });
  }
  return out;
}

// the rows in the sky bands, without making the list
function skyRows(view: BandsView, tile: number): number {
  const first = skyFrom(view);
  const start = Math.ceil(first / tile) * tile;
  return Math.max(0, view.height - start);
}

function skyShare(view: BandsView, tile: number): number {
  return skyRows(view, tile) / view.height;
}

export const QualityWaterBands = { MARGIN_ROWS, lastWaterRow, skyFrom, bands, skyRows, skyShare };

M.QualityWaterBands = QualityWaterBands;
