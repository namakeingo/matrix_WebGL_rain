#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
${M.Camera.GLSL}
${glsl.fog}
${M.GlyphAtlas.VERTEX_GLSL}
${M.HASH_GLSL}
${LIGHT_GLSL}
uniform highp sampler2D uBoltGlyphs;
uniform int uFirst;
uniform float uMirror;
uniform int uGlyphs;
uniform vec4 uAge;
// the characters drawn from a list of their indices (aDrop: slot x region + place), else uFirst + gl_InstanceID
uniform bool uListed;
// the character's light under which it draws nothing (HDR), for each level 0 to 40 (0: every character)
uniform float uGlyphEps[41];
in vec2 aCorner;
in uint aDrop;
out vec2 vUv;
flat out int vGlyph;
out float vLight;
out float vHead;
out vec3 vWorld;
flat out float vCover;
const int ACROSS = ${GLYPHS_ACROSS};
const int TEXELS = ${GLYPH_TEXELS};
const int INK_ROW = ${MOST_GLYPHS / GLYPHS_ACROSS};
const int INKS_ACROSS = ${GLYPHS_ACROSS * GLYPH_TEXELS};
const float COVER_LIGHT = ${COVER_LIGHT.toFixed(4)};
const float FOOTPRINT_FULL_PX = ${FOOTPRINT_FULL_PX.toFixed(1)};
const int BOLT_LEVELS = ${QUALITY_LEVELS};
vec4 texel(int i, int k) {
  return texelFetch(uBoltGlyphs, ivec2((i % ACROSS) * TEXELS + k, i / ACROSS), 0);
}
// component c of v (never a dynamic index into a vector)
float pick(vec4 v, int c) {
  return c == 0 ? v.x : c == 1 ? v.y : c == 2 ? v.z : v.w;
}
// a glyph's ink (over the share of the glyphs with ink; 0: blank)
float inkOf(int g) {
  int t = g / 4;
  return pick(texelFetch(uBoltGlyphs, ivec2(t % INKS_ACROSS, INK_ROW + t / INKS_ACROSS), 0), g - t * 4);
}
void hide() {
  vGlyph = 0;
  vLight = 0.0;
  vCover = 0.0;
  vWorld = vec3(0.0);
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
void main() {
  int i = uListed ? int(aDrop) : uFirst + gl_InstanceID;
  vec4 p = texel(i, 0);
  vec4 q = texel(i, 1);
  vec4 j = texel(i, 2);
  vec4 n = texel(i, 3);
  vec4 r = texel(i, 4);
  float rate = r.x;
  vUv = vec2(aCorner.x, 1.0 - aCorner.y);
  vHead = 0.0;
  // (the places moved since the strike started: its age x the place's rate, whole and a part)
  float moved = slotOf(uAge, uSlot) * rate;
  float shift = floor(moved);
  float phase = moved - shift;
  // (the glyph that came to this place: the seed of the place shift places back)
  uint seed = (uint(q.x) + 16777216u - (uint(shift) * 7919u) % 16777216u) % 16777216u;
  int glyph = int(hash(seed) % uint(uGlyphs));
  float ink = inkOf(glyph);
  // (a part phase of the way to the next place: to the joint, then on)
  vec3 place = phase < j.w ? mix(p.xyz, j.xyz, phase / max(j.w, 1e-6)) : mix(j.xyz, n.xyz, (phase - j.w) / max(1.0 - j.w, 1e-6));
  // (its line's share across the way from the eye where it is: the line is seen over its length as
  // projected, the characters face the camera; from the way to the next place, so it changes
  // smoothly as the character moves on)
  vec3 way = n.xyz - p.xyz;
  vec3 toEye = place - cEye.xyz;
  float c = dot(way, toEye) / max(length(way) * length(toEye), 1e-9);
  float across = sqrt(max(0.0, 1.0 - c * c));
  float light = ink > 0.0 ? q.y / ink * across * itemLight(q.z, uSlot) : 0.0;
  // (cut at the slot's growth: shown from when its place is reached, until hidden, moving no
  // further than the line has grown)
  float grown = slotOf(uGrown, uSlot);
  float limit = r.z > r.y ? min(n.w, (grown - r.y) / (r.z - r.y)) : n.w;
  vec4 middle = cViewProj * vec4(place.x, place.y * uMirror, place.z, 1.0);
  // (the quad's cull is exact, made on the CPU for the listed characters: the middle as a point lost a big close character and drew a small far one;
  // the footprint's level gives the least light that draws: a character whose most light, its radiance over its ink x the slot's light, is under it
  // adds under the level's eps to a pixel)
  int level = middle.w > 0.0 ? clamp(int(ceil(float(BOLT_LEVELS) * clamp(p.w * cEye.w / middle.w / FOOTPRINT_FULL_PX, 1.0 / float(BOLT_LEVELS), 1.0))), 1, BOLT_LEVELS) : BOLT_LEVELS;
  float eps = uGlyphEps[level];
  bool faint = eps > 0.0 && ink > 0.0 && q.y / ink * itemLight(q.z, uSlot) < eps;
  if (light <= 0.0 || p.w <= 0.0 || grown < r.y || grown >= r.w || phase > limit || faint) {
    hide();
    return;
  }
  vGlyph = glyph;
  vec3 world = place + vec3((aCorner.x - 0.5) * p.w, (aCorner.y - 0.5) * p.w, 0.0);
  world.y *= uMirror;
  vec4 clip = cViewProj * vec4(world, 1.0);
  vWorld = world;
  vLight = light * glyphFog(world, clip, uMirror < 0.0);
  vCover = min(1.0, light / COVER_LIGHT);
  gl_Position = clip;
}