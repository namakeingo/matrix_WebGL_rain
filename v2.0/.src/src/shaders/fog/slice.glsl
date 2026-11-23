
uniform int uSlice;
// 1: the column may hold this draw's slice when nothing reads it (directHeld); 0: every column gathers it
uniform float uCull;
const float CULL_BELOW = ${CULL_BELOW.toFixed(2)};
const float CULL_RELATIVE = ${CULL_RELATIVE};
// 1: a column also holds a slice where its own ray's transmittance bound is under TAIL_T (the air's alone: no density floor
// since Feature U3, story M2: models/quality/fog.ts); 0: only the water's cut holds
uniform float uTail;
const float TAIL_T = ${QualityFog.TAIL_T.toExponential(6)};
// an upper bound of the transmittance along a ray to distance a: the air's alone (the front cloud's density has no floor, so its least is 0; dy, the ray's rise, is not needed)
float tailBound(float dy, float a) {
  return exp(-AIR_EXTINCTION * a);
}
float sliceLod(float a, float b) {
  return lodOf(max(0.5 * (a + b) * fVolume.z / cEye.w, b - a));
}
// the distance along the ray of the column at fc (gl_FragCoord's units) to the plane CULL_BELOW under the still water
// (1e30: the ray does not go down)
float underWater(vec2 fc) {
  float dy = columnRay(fc).y;
  return dy < -1e-6 ? (cEye.y + CULL_BELOW) / -dy : 1e30;
}
// whether nothing reads the eye's volume at the column fc from a slice starting at a on: with the water drawn, a pixel
// below the horizon stops at the water and what is above it before the plane; the volume is read between columns, so the
// column holds the slice only when it starts past that distance along the rays of the column and its eight neighbours
bool directHeld(vec2 fc, float a) {
  if (uCull < 0.5) return false;
  if (uTail > 0.5 && tailBound(columnRay(fc).y, a) < TAIL_T) return true;
  float far = underWater(fc);
  if (far >= 1e29) return false;
  // (the eight neighbours in one loop, its count a value at run time (uCull is 1 here: the function returned above when it is 0): the centre, offset (0, 0), is the loop's fifth, a max with itself)
  int ring = int(8.0 * uCull + 1.5);
  for (int i = 0; i < ring; i++) {
    if (i >= 9) break;
    far = max(far, underWater(fc + vec2(float(i % 3) - 1.0, float(i / 3) - 1.0)));
  }
  return a > far * (1.0 + CULL_RELATIVE);
}