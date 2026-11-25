// QualityWaterBands: which of the guard's bands of rows of the water pass hold no water, pure: no GL, no page.
// A pixel is water when its ray from the eye points down (the shader's `d.y < 0`, d = rayOf(gl_FragCoord.xy), the pixel's centre); the
// sign of d.y depends on the row only (not the column or the width): d.y has the sign of (height / 2 - py) / focal cos(pitch) + sin(pitch),
// py the centre's row from the top. A pixel above the horizon gets, from the water program, atmosSeen(d) * fog.a + fog.rgb with the fog read at the
// pixel to FOG_FAR and the strikes' share as the second output: nothing of the waves, the reflection or the strike grids, and no derivative
// is used by it, so the sky-only program (Water.skyFragment: the water's source without the water's parts) draws the same values there.
// A band is drawn with it when every one of its rows lies above the last row that holds water by MARGIN_ROWS rows more (against float32
// rounding of d.y at the horizon); a band that holds the horizon is drawn with the full program. Rows count from the bottom (gl_FragCoord.y
// - 0.5), as Quad.drawTiled's bands do: from 0, tile rows each, the last one shorter.
//
// Changelog:
// 2026-11-08: new.
// 2026-11-25: farRows: the water rows drawn at half resolution.
// 2026-11-25: splitBands: a band as tall as the screen is split at skyFrom (the sky-only program ran for no row at the guard's 16384-row band).
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

// the water draw's parts: the guard's bands as bands() makes them when they are shorter than the screen; a band as tall as the screen (the guard's size at the
// defaults: 16384 rows) is split at skyFrom, the full part [0, skyFrom) first and the sky part [skyFrom, height) after it (a part with no rows is left out)
function splitBands(view: BandsView, tile: number): Band[] {
  if (tile < view.height) {
    return bands(view, tile);
  }
  const first = skyFrom(view);
  const out: Band[] = [];
  if (first > 0) {
    out.push({ from: 0, to: first, sky: false });
  }
  if (first < view.height) {
    out.push({ from: first, to: view.height, sky: true });
  }
  return out;
}

// the water rows drawn at half resolution (story W3): the far water, the rows nearest the horizon whose centre's flat hit (eyeY / -d.y) is at least distanceM away, as a band [from, to) of rows
// from the bottom, both multiples of `align` (a half-resolution pixel is a block of align rows: the far end rounded up from the first far row, the horizon's end rounded down from the
// last water row, so the horizon's odd row stays with the full program); from = to = 0 when there is none. The flat hit's distance grows with the row, so the first far row is found by bisection.
interface FarView extends BandsView {
  width: number;
  rayAt(px: number, py: number): ArrayLike<number>;
}
function farRows(view: FarView, eyeY: number, distanceM: number, align: number): { from: number; to: number } {
  const last = lastWaterRow(view);
  if (last < 0) {
    return { from: 0, to: 0 };
  }
  const far = (k: number) => eyeY / -view.rayAt(view.width / 2, view.height - (k + 0.5))[1]! >= distanceM;
  if (!far(last)) {
    return { from: 0, to: 0 };
  }
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (far(mid)) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  const from = Math.ceil(lo / align) * align;
  const to = Math.floor((last + 1) / align) * align;
  return to > from ? { from, to } : { from: 0, to: 0 };
}

function skyShare(view: BandsView, tile: number): number {
  return skyRows(view, tile) / view.height;
}

export const QualityWaterBands = { MARGIN_ROWS, lastWaterRow, skyFrom, bands, splitBands, farRows, skyRows, skyShare };

M.QualityWaterBands = QualityWaterBands;
