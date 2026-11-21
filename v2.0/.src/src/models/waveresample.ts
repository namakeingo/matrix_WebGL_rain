// WaveResample: the waves' state moved from one grid to another at a switch of the grid (the production 1024 x 512 cells and the full 2048 x 1024), the CPU model of the
// resample pass (shaders/waves/resample_fragment.glsl, which implements exactly this). Pure: no GL, no page.
//
// The state is a (height, velocity) pair a cell, row by row: index (j x across + i) x 2 + channel. The velocity is the height's change a STEP (step_fragment.glsl: speed' =
// (speed + cdt^2 laplacian) x damp, h' = (h + speed') x damp), so it is proportional to the step's way cdt: a switch scales it by cdt(new grid) / cdt(old grid) (0.5 going
// to the full grid, 2 coming back); the height is the same physical value.
//
// The two grids cover the same world (their coordinates are x / distance across and 1 / distance down), so a cell's place is its index fraction: new cell I is at the old
// coordinate (I + 0.5) x from / to - 0.5 (in the old cells' middles). Up (more cells): bilinear between the four old cells around that place, the coordinate clamped to
// [0, from - 1] (the side's cell goes on out to the side). Down (fewer cells, a whole factor): the mean of the cells under the new cell (2 x 2). Both keep the mean of the
// field (bilinear with clamped sides gives each old cell the weight 2 over the four new cells that read it).
//
// Changelog:
// 2026-11-20: new.
import { M } from "../engine/core";

function resample(state: Float32Array, fromAcross: number, fromDown: number, toAcross: number, toDown: number, velocityScale: number): Float32Array {
  const out = new Float32Array(toAcross * toDown * 2);
  if (fromAcross > toAcross) {
    // down: the mean of the (from / to) x (from / to) old cells under each new cell
    const rx = Math.round(fromAcross / toAcross);
    const ry = Math.round(fromDown / toDown);
    const weight = 1 / (rx * ry);
    for (let j = 0; j < toDown; j++) {
      for (let i = 0; i < toAcross; i++) {
        let h = 0;
        let v = 0;
        for (let q = 0; q < ry; q++) {
          for (let p = 0; p < rx; p++) {
            const k = ((j * ry + q) * fromAcross + i * rx + p) * 2;
            h += state[k]!;
            v += state[k + 1]!;
          }
        }
        out[(j * toAcross + i) * 2] = h * weight;
        out[(j * toAcross + i) * 2 + 1] = v * weight * velocityScale;
      }
    }
    return out;
  }
  const last = (n: number) => n - 1;
  for (let j = 0; j < toDown; j++) {
    const fy = Math.min(Math.max(((j + 0.5) * fromDown) / toDown - 0.5, 0), last(fromDown));
    const y0 = Math.min(Math.floor(fy), last(fromDown));
    const y1 = Math.min(y0 + 1, last(fromDown));
    const ty = fy - y0;
    for (let i = 0; i < toAcross; i++) {
      const fx = Math.min(Math.max(((i + 0.5) * fromAcross) / toAcross - 0.5, 0), last(fromAcross));
      const x0 = Math.min(Math.floor(fx), last(fromAcross));
      const x1 = Math.min(x0 + 1, last(fromAcross));
      const tx = fx - x0;
      for (let c = 0; c < 2; c++) {
        const a = state[(y0 * fromAcross + x0) * 2 + c]! * (1 - tx) + state[(y0 * fromAcross + x1) * 2 + c]! * tx;
        const b = state[(y1 * fromAcross + x0) * 2 + c]! * (1 - tx) + state[(y1 * fromAcross + x1) * 2 + c]! * tx;
        out[(j * toAcross + i) * 2 + c] = (a * (1 - ty) + b * ty) * (c === 1 ? velocityScale : 1);
      }
    }
  }
  return out;
}

export const WaveResample = { resample };

M.WaveResample = WaveResample;
