// The atlas's drawing: the characters drawn on any 2D canvas (a page's, or an OffscreenCanvas on
// the page or in the scene's worker), white on black, a batch at a time, and each one's ink. No
// GL and no page: run by GlyphAtlas (engine/glyphs.ts) and by the scene's worker
// (workers/sceneworker.ts), the same drawing either way.
//
// Changelog:
// 2026-11-04: a module of src/models/ (was GlyphAtlas.drawBatch in engine/glyphs.js).

// a 2D canvas's context the characters are drawn on (a page's canvas, or an OffscreenCanvas)
export type AtlasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// a character's cell (px, square)
export const SIZE = 64;
// the characters drawn on the canvas at once, one under another, and sent in one upload (a
// canvas the script reads from: kept on the CPU, so no read back from the GPU a character)
export const BATCH = 64;

// count characters (glyphs from first) drawn on a 2D canvas's context (a page's or a worker's
// OffscreenCanvas), white on black, each SIZE rows under the last; each one's ink (its mean over
// its cell, 0 to 1) into inks; gives their ink's sum (in levels of 255 over the pixels)
export const drawBatch = (ctx: AtlasContext, glyphs: ArrayLike<string>, first: number, count: number, inks: Float32Array): number => {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(SIZE * 0.8)}px 'MS Gothic', 'Yu Gothic', monospace`;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SIZE, SIZE * BATCH);
  ctx.fillStyle = "#fff";
  for (let k = 0; k < count; k++) {
    ctx.fillText(glyphs[first + k], SIZE / 2, SIZE * k + SIZE / 2);
  }
  // (the canvas is the script's, kept on the CPU: read without a read-back from the GPU)
  const pixels = ctx.getImageData(0, 0, SIZE, SIZE * count).data;
  let ink = 0;
  for (let k = 0; k < count; k++) {
    let own = 0;
    for (let i = k * SIZE * SIZE * 4; i < (k + 1) * SIZE * SIZE * 4; i += 4) {
      own += pixels[i];
    }
    inks[first + k] = own / (255 * SIZE * SIZE);
    ink += own;
  }
  return ink;
};
