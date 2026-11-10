#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp usampler2D;
${TEST_VIEWS}
${M.Camera.GLSL}
${glsl.fog}
${M.GlyphAtlas.VERTEX_GLSL}
${M.HASH_GLSL}
${CELL_GLSL}
uniform uint uStep;
uniform float uMirror;
// a trail's cell (not the head) whose light is under this is not drawn (0: all drawn)
uniform float uLightCut;
// from this distance (0: never) the fog is read once for the cell's four corners, at its middle
uniform float uFogOnce;
uniform int uGlyphs;
uniform int uFirstDrop;
uniform bool uListed;
uniform int uTrail;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
// React to music: the drops' light multiple by bin across the window (128 bins, four to a vec4), and the window's width at distance 1 (0: none)
uniform vec4 uMusicLight[32];
uniform float uMusicSpan;
uniform bool uCustom;
uniform bool uWave;
uniform float uWaveWidth;
uniform float uWaveNow;
uniform float uWavePerStep;
#ifdef TEST_VIEWS
uniform int uOnlyDrop;
uniform bool uHeadOnly;
#endif
in vec2 aCorner;
// the drops to draw, one value for each uTrail instances (uListed)
in uint aDrop;
out vec2 vUv;
flat out int vGlyph;
out float vLight;
out float vHead;
out vec3 vWorld;
flat out vec3 vColor;
const float WAVE_SCREEN = ${WAVE_SCREEN.toFixed(6)};
float musicBin(int bin) {
  return uMusicLight[bin >> 2][bin & 3];
}
// a place's light multiple from the music, with soft edges that overlap the neighbouring columns and soften linearly (MusicRain.lightAt): its place across the window in bins by its
// bearing (x over distance); a bin is at its own multiple over its middle half, and over a quarter bin each side of every edge the two bins beside the edge cross-fade linearly, their
// weights always summing to 1 (half each at the edge): the contributions of two columns on an edge always sum to the same peak
float musicLight(float bearing) {
  if (uMusicSpan <= 0.0) {
    return 1.0;
  }
  float u = clamp((bearing / uMusicSpan + 0.5) * 128.0, 0.0, 127.999999);
  int c = int(floor(u));
  float f = u - float(c);
  float own = musicBin(c);
  if (f < 0.25) {
    float w = 0.5 + 2.0 * f;
    return w * own + (1.0 - w) * musicBin(max(c - 1, 0));
  }
  if (f > 0.75) {
    float w = 0.5 + 2.0 * (1.0 - f);
    return w * own + (1.0 - w) * musicBin(min(c + 1, 127));
  }
  return own;
}
${COLOR_GLSL}
void main() {
  int drop = uListed ? int(aDrop & 0xFFFFFu) : uFirstDrop + gl_InstanceID / uTrail;
  int age = gl_InstanceID % uTrail;
  // the trail's instances drawn for the drop's level (0: all of them; the instances of an age at or past it are not drawn)
  int cells = uListed ? int(aDrop >> 20) : 0;
  bool inTrail = cells == 0 || age < cells;
  Cell c = cellOf(drop, uStep, age);
  bool shown = c.drawn && inTrail;
#ifdef TEST_VIEWS
  shown = shown && (uOnlyDrop < 0 || drop == uOnlyDrop) && (!uHeadOnly || age == 0);
#endif
  float x = acrossOf(drop, c.fall, c.z);
  // (on the screen at all: its middle; nothing else worked out for a character not drawn)
  vec4 middle = cViewProj * vec4(x, (float(c.row) + 0.5) * CELL * uMirror + floorOf(c.z), -c.z, 1.0);
  shown = shown && glyphShown(middle);
  vUv = vec2(aCorner.x, 1.0 - aCorner.y);
  vHead = age == 0 ? 1.0 : 0.0;
  if (!shown) {
    vGlyph = 0;
    vLight = 0.0;
    vWorld = vec3(0.0);
    vColor = vec3(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  uint cell = uint(drop) * 4099u + c.row * 131u + c.fall * 7919u;
  // each character changes now and then, at its own time
  uint epoch = (uStep + hash(cell) % 64u) / 48u;
  vGlyph = int(hash(cell ^ (epoch * 2654435761u)) % uint(uGlyphs));
  vec3 world = vec3(x + (aCorner.x - 0.5) * CELL, (float(c.row) + aCorner.y) * CELL * uMirror + floorOf(c.z), -c.z);
  vec4 clip = cViewProj * vec4(world, 1.0);
  vWorld = world;
  vColor = fallColor(x / c.z / WAVE_SCREEN + 0.5, uWaveNow - float(c.since) * uWavePerStep) * musicLight(x / c.z);
  bool once = uFogOnce > 0.0 && c.z >= uFogOnce;
  float light = (1.0 - float(age) / float(uTrail)) * (once ? glyphFog(vec3(x, (float(c.row) + 0.5) * CELL * uMirror + floorOf(c.z), -c.z), middle, uMirror < 0.0) : glyphFog(world, clip, uMirror < 0.0));
  if (age > 0 && light < uLightCut) {
    vGlyph = 0;
    vLight = 0.0;
    vWorld = vec3(0.0);
    vColor = vec3(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vLight = light;
  gl_Position = clip;
}