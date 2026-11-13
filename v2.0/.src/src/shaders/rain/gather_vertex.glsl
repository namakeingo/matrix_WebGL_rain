#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
${M.Camera.GLSL}
${M.HASH_GLSL}
${WAVE_LIFT_GLSL}
${CELL_GLSL}
// the step the heights are read for (the frame's)
uniform uint uStep;
// the picture's rows (the drops' texels: DROPS_ACROSS across)
uniform int uRows;
flat out vec4 vMeet;
// the surface's height in whole rows over the floor (WaveLift.rowsOf: round(h / CELL), capped at +-CAP) + BIAS, as a byte's fraction
float meetByte(float h) {
  return (clamp(floor(h / CELL + 0.5), -${M.WaveLift.CAP_ROWS}.0, ${M.WaveLift.CAP_ROWS}.0) + ${M.WaveLift.BIAS}.0) / 255.0;
}
// one point a drop at its own texel: where the drop's fall now and the fall before end (its place across in each: the landing's place), the surface's rows there (the water's live
// height, one wave read each), and the fall's low byte; the wheel reads the picture back (models/rainwheel.ts, RainWheel.meetOf)
void main() {
  int drop = gl_VertexID;
  Cell c = cellOf(drop, uStep, 0);
  uint fall = c.fall;
  // (one read site for the two falls: the fall now, then the fall before)
  float now = 0.0;
  float before = 0.0;
  for (int k = 0; k < 2; k++) {
    uint f = k == 0 ? fall : fall - 1u;
    float coded = meetByte(waveHeight(vec2(acrossOf(drop, f, c.z), c.z)));
    if (k == 0) {
      now = coded;
    } else {
      before = coded;
    }
  }
  vMeet = vec4(now, before, float(fall & 255u) / 255.0, 1.0);
  gl_Position = vec4((float(drop % DROPS_ACROSS) + 0.5) / float(DROPS_ACROSS) * 2.0 - 1.0, (float(drop / DROPS_ACROSS) + 0.5) / float(uRows) * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}
