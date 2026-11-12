// ReflectionFrame: the mirrored picture's frame as a pure model (no GL, no page: importable in any thread). The mirrored scene is drawn through the view's own camera (y flipped) into a
// picture larger than the view by a margin on each side, so the water's lookup (the refinement's steps and the glossy taps, which the wave normal bends away from the pixel's own place)
// can land just outside the screen and still find the scene there.
// - The margin is a fraction of the view's width and height (Reflection.MARGIN), taken in whole pixels on each axis (round(fraction x size)), so a texel of the picture is exactly a
//   pixel of the view moved by the margin: with the margin 0 the picture is the view and every mapping is the plain pixel over the size.
// - The picture has the view's pixel density: its projection is the view's with the clip x and y scaled by the view's size over the picture's (scaleX, scaleY), the same focal length in
//   pixels over a larger viewport (not a wider field of view squeezed into the same pixels). scaleViewProjection applies that to a column-major view-projection.
// - toUv / fromUv map a place of the view (pixels, the margin outside [0, size]) to the picture's texture coordinates and back; pictureOf the clip point (ndc in the picture's own clip
//   space) to the picture's pixels.
// - The fog's volume is indexed by (at / size + w) / (1 + 2 w) with the margin w of the volume past the view; read from the picture, where `at` is in the picture's pixels and the size
//   its own, the same index needs the margin fogMargin(w, frame) = (w - m) / (1 + 2 m) (m the mean of the two axes' margin fractions: the two pixel roundings differ by under a pixel).
// - marginFor: the margin a measured lookup displacement needs, the PERCENTILE-th percentile of the displacement in pixels (per axis) times 1 + HEADROOM over the view's size, the larger
//   axis's: the test that measures the displacements (scenetest reflectionlookup) reports it, and Reflection.MARGIN is set from it.
//
// Changelog:
// 2026-11-12: new.
import { M } from "../engine/core";

export interface ReflectionFrameOf {
  // the margin in pixels on each side, and the picture's size
  marginX: number;
  marginY: number;
  width: number;
  height: number;
  // the projection's x and y scale (the view's size over the picture's)
  scaleX: number;
  scaleY: number;
  // the view's size the frame is for
  viewWidth: number;
  viewHeight: number;
}

// the percentile of the displacements the margin covers, and the headroom over it
const PERCENTILE = 99.9;
const HEADROOM = 0.01;

// the frame of a view of width x height pixels with the margin (a fraction of the size, each side)
function of(width: number, height: number, margin: number): ReflectionFrameOf {
  const marginX = Math.round(margin * width);
  const marginY = Math.round(margin * height);
  const pictureWidth = width + 2 * marginX;
  const pictureHeight = height + 2 * marginY;
  return { marginX, marginY, width: pictureWidth, height: pictureHeight, scaleX: width / pictureWidth, scaleY: height / pictureHeight, viewWidth: width, viewHeight: height };
}

// a place of the view (pixels, from its corner; the margin outside the view's own range) as the picture's texture coordinates, into out
function toUv(frame: ReflectionFrameOf, x: number, y: number, out: number[]): number[] {
  out[0] = (x + frame.marginX) / frame.width;
  out[1] = (y + frame.marginY) / frame.height;
  return out;
}

// the picture's texture coordinates as a place of the view (pixels), into out
function fromUv(frame: ReflectionFrameOf, u: number, v: number, out: number[]): number[] {
  out[0] = u * frame.width - frame.marginX;
  out[1] = v * frame.height - frame.marginY;
  return out;
}

// a clip point of the picture's projection (ndc x and y) as the picture's pixels, into out
function pictureOf(frame: ReflectionFrameOf, ndcX: number, ndcY: number, out: number[]): number[] {
  out[0] = (ndcX * 0.5 + 0.5) * frame.width;
  out[1] = (ndcY * 0.5 + 0.5) * frame.height;
  return out;
}

// the margin the fog's volume reads through when the pixel is the picture's (see the head)
function fogMargin(volumeMargin: number, frame: ReflectionFrameOf): number {
  const m = 0.5 * (frame.marginX / frame.viewWidth + frame.marginY / frame.viewHeight);
  return (volumeMargin - m) / (1 + 2 * m);
}

// the p-th percentile (0 to 100, nearest rank) of values
function percentile(values: ArrayLike<number>, p: number): number {
  const n = values.length;
  if (n === 0) {
    return 0;
  }
  const sorted = Float64Array.from(values as ArrayLike<number>).sort();
  const rank = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
  return sorted[rank];
}

// the margin (a fraction of the size) a lookup's displacements need: the larger axis's PERCENTILE-th percentile over the size, plus HEADROOM
function marginFor(dxs: ArrayLike<number>, dys: ArrayLike<number>, width: number, height: number): number {
  const x = percentile(dxs, PERCENTILE) / width;
  const y = percentile(dys, PERCENTILE) / height;
  return Math.max(x, y) * (1 + HEADROOM);
}

// the view-projection (column-major) with its clip x row scaled by scaleX and its clip y row by scaleY, into out
function scaleViewProjection(vp: ArrayLike<number>, frame: ReflectionFrameOf, out: Float32Array): Float32Array {
  for (let c = 0; c < 4; c++) {
    out[c * 4] = vp[c * 4] * frame.scaleX;
    out[c * 4 + 1] = vp[c * 4 + 1] * frame.scaleY;
    out[c * 4 + 2] = vp[c * 4 + 2];
    out[c * 4 + 3] = vp[c * 4 + 3];
  }
  return out;
}

export const ReflectionFrame = { of, toUv, fromUv, pictureOf, fogMargin, percentile, marginFor, scaleViewProjection, PERCENTILE, HEADROOM };

(M as unknown as Record<string, unknown>).ReflectionFrame = ReflectionFrame;
