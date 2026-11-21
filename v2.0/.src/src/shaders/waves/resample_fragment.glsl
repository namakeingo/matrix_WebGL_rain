#version 300 es
precision highp float;
precision highp int;
// the waves' state (height, velocity a step) moved to another grid over the same world: models/waveresample.ts is its CPU model.
// Up (the new grid has more cells): bilinear between the four old cells' middles around the new cell's place, the coordinate clamped to the grid.
// Down (fewer cells, a factor 2): the mean of the 2 x 2 old cells under the new cell. The velocity is scaled by uVelocityScale (the new step's way over the old).
// With uMix of 0 or more the same program draws the dissolve of a switch (models/wavedissolve.ts is its CPU model): the picture the water reads, one height a cell: the old state
// (uOld, resampled as above) where the cell's ordered-dither threshold is at or above uMix, the new state's height (uNew, on the new grid) where it is under. A uMix under 0 is
// the plain resample. One program for both so that the compile total does not grow by a program.
uniform highp sampler2D uOld;
uniform highp sampler2D uNew;
uniform vec2 uFrom;
uniform vec2 uTo;
uniform float uVelocityScale;
uniform float uMix;
out vec4 outColor;
vec2 cell(ivec2 c) {
  return texelFetch(uOld, clamp(c, ivec2(0), ivec2(uFrom) - 1), 0).rg;
}
// the 8 x 8 ordered-dither level (0 to 63) of a cell: B2 = [[0, 2], [3, 1]] by (y, x), the coordinates' bits from the lowest, each pair's digit one place further down
int level8(ivec2 c) {
  int v = 0;
  for (int k = 0; k < 3; k++) {
    int bx = (c.x >> k) & 1;
    int by = (c.y >> k) & 1;
    v = v * 4 + (by == 0 ? (bx == 0 ? 0 : 2) : (bx == 0 ? 3 : 1));
  }
  return v;
}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 s;
  if (uFrom.x > uTo.x) {
    ivec2 b = c * 2;
    s = 0.25 * (cell(b) + cell(b + ivec2(1, 0)) + cell(b + ivec2(0, 1)) + cell(b + ivec2(1, 1)));
  } else {
    vec2 p = clamp((vec2(c) + 0.5) * uFrom / uTo - 0.5, vec2(0.0), uFrom - 1.0);
    ivec2 i0 = ivec2(floor(p));
    vec2 t = p - vec2(i0);
    vec2 a = mix(cell(i0), cell(i0 + ivec2(1, 0)), t.x);
    vec2 b = mix(cell(i0 + ivec2(0, 1)), cell(i0 + ivec2(1, 1)), t.x);
    s = mix(a, b, t.y);
  }
  if (uMix >= 0.0) {
    float threshold = (float(level8(c)) + 0.5) / 64.0;
    outColor = vec4(threshold >= uMix ? s.x : texelFetch(uNew, c, 0).r, 0.0, 0.0, 1.0);
    return;
  }
  outColor = vec4(s.x, s.y * uVelocityScale, 0.0, 1.0);
}
