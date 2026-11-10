#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
${TEST_VIEWS}
${M.Camera.GLSL}
${M.HASH_GLSL}
${CELL_GLSL}
uniform uint uStep;
uniform int uGlyphs;
uniform int uFirstDrop;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform bool uCustom;
uniform bool uWave;
uniform float uWaveWidth;
uniform float uWaveNow;
uniform float uWavePerStep;
// the box its cell must meet (device pixels from the screen's top left: x0, y0, x1, y1), the
// scene's shift across (device pixels), this step's rank among those drawn (0: the newest) and
// their count, and the distance its depth is scaled by
uniform vec4 uBox;
uniform float uShift;
uniform float uRank;
uniform float uRanks;
uniform float uFar;
in vec2 aCorner;
out vec2 vUv;
flat out int vGlyph;
flat out vec3 vColor;
#ifdef TEST_VIEWS
flat out ivec2 vStamp;
#endif
const float WAVE_SCREEN = ${WAVE_SCREEN.toFixed(6)};
${COLOR_GLSL}
// a place of the world on the screen (device pixels from the top left, the shift included); w:
// its clip w
vec3 screenOf(vec3 world) {
  vec4 clip = cViewProj * vec4(world, 1.0);
  return vec3((clip.x / clip.w * 0.5 + 0.5) * cScreen.x + uShift, (0.5 - clip.y / clip.w * 0.5) * cScreen.y, clip.w);
}
// each drop's newest character at a step (one instance a drop), drawn where the rain draws it,
// only when its cell meets the box
void main() {
  int drop = uFirstDrop + gl_InstanceID;
  Cell c = cellOf(drop, uStep, 0);
  float x = acrossOf(drop, c.fall, c.z);
  float bottom = float(c.row) * CELL + floorOf(c.z);
  // (first its middle: a cell whose middle is further from the box than its size on the screen
  // misses it, its corners not worked out)
  vec3 middle = screenOf(vec3(x, bottom + 0.5 * CELL, -c.z));
  float reach = middle.z > 0.0 ? CELL * cEye.w / middle.z + 2.0 : 0.0;
  if (!c.drawn || middle.z <= 0.0 || middle.x + reach < uBox.x || middle.x - reach > uBox.z || middle.y + reach < uBox.y || middle.y - reach > uBox.w) {
    vUv = vec2(0.0);
    vGlyph = 0;
    vColor = vec3(0.0);
#ifdef TEST_VIEWS
    vStamp = ivec2(0);
#endif
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 p0 = screenOf(vec3(x - 0.5 * CELL, bottom, -c.z));
  vec3 p1 = screenOf(vec3(x + 0.5 * CELL, bottom, -c.z));
  vec3 p2 = screenOf(vec3(x - 0.5 * CELL, bottom + CELL, -c.z));
  vec3 p3 = screenOf(vec3(x + 0.5 * CELL, bottom + CELL, -c.z));
  vec2 lo = min(min(p0.xy, p1.xy), min(p2.xy, p3.xy));
  vec2 hi = max(max(p0.xy, p1.xy), max(p2.xy, p3.xy));
  bool shown = c.drawn && min(min(p0.z, p1.z), min(p2.z, p3.z)) > 0.0 && hi.x > uBox.x && lo.x < uBox.z && hi.y > uBox.y && lo.y < uBox.w;
  vUv = vec2(aCorner.x, 1.0 - aCorner.y);
#ifdef TEST_VIEWS
  vStamp = ivec2(int(uStep % 255u) + 1, drop);
#endif
  if (!shown) {
    vGlyph = 0;
    vColor = vec3(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  uint cell = uint(drop) * 4099u + c.row * 131u + c.fall * 7919u;
  uint epoch = (uStep + hash(cell) % 64u) / 48u;
  vGlyph = int(hash(cell ^ (epoch * 2654435761u)) % uint(uGlyphs));
  vec3 world = vec3(x + (aCorner.x - 0.5) * CELL, (float(c.row) + aCorner.y) * CELL + floorOf(c.z), -c.z);
  vec4 clip = cViewProj * vec4(world, 1.0);
  vColor = fallColor(x / c.z / WAVE_SCREEN + 0.5, uWaveNow - float(c.since) * uWavePerStep);
  // (the shift across; the depth: a newer step's nearer than any older one's, within a step by
  // its distance)
  clip.x += 2.0 * uShift / cScreen.x * clip.w;
  float depth = (uRank + clamp(c.z / uFar, 0.0, 0.999)) / uRanks;
  clip.z = (2.0 * depth - 1.0) * clip.w;
  gl_Position = clip;
}