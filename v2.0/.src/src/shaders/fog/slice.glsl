
uniform int uSlice;
// 1: the column may hold this draw's slice when nothing reads it (directHeld); 0: every column gathers it
uniform float uCull;
const float CULL_BELOW = ${CULL_BELOW.toFixed(2)};
const float CULL_RELATIVE = ${CULL_RELATIVE};
// 1: a column also holds a slice where its own ray's transmittance bound is under TAIL_T (the density's floor at the ray's highest
// point and the air: models/quality/fog.ts); 0: only the water's cut holds
uniform float uTail;
const float TAIL_T = ${QualityFog.TAIL_T.toExponential(6)};
// an upper bound of the transmittance along a ray rising dy per unit of direction from the eye to distance a
float tailBound(float dy, float a) {
  float yHigh = cEye.y + max(dy, 0.0) * a;
  return exp(-(AIR + fParams.x * 0.2 * exp(-max(yHigh, 0.0) / 4.0)) * a);
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
  far = max(far, underWater(fc + vec2(-1.0, -1.0)));
  far = max(far, underWater(fc + vec2(0.0, -1.0)));
  far = max(far, underWater(fc + vec2(1.0, -1.0)));
  far = max(far, underWater(fc + vec2(-1.0, 0.0)));
  far = max(far, underWater(fc + vec2(1.0, 0.0)));
  far = max(far, underWater(fc + vec2(-1.0, 1.0)));
  far = max(far, underWater(fc + vec2(0.0, 1.0)));
  far = max(far, underWater(fc + vec2(1.0, 1.0)));
  return a > far * (1.0 + CULL_RELATIVE);
}