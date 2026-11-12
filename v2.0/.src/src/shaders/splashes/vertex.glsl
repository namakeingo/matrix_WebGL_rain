#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp usampler2D;
${M.Camera.GLSL}
${glsl.fog}
${glsl.medium}
${glsl.shade}
${M.GlyphAtlas.VERTEX_GLSL}
${M.GlyphAtlas.LIGHT_VERTEX_GLSL}
${M.HASH_GLSL}
#define WAVE_LIFT_AT
${WAVE_LIFT_GLSL}
uniform usampler2D uSplashes;
uniform uint uStep;
uniform uint uFrom;
uniform uint uTo;
uniform int uFirstSlot;
uniform bool uListed;
uniform float uMirror;
uniform int uGlyphs;
uniform int uTrail;
uniform int uAges;
uniform float uPointPx;
uniform float uLodFloor;
uniform float uHeadPeak;
in vec2 aCorner;
in uint aDrop;
out vec2 vUv;
flat out int vGlyph;
out float vLight;
out float vHead;
out vec3 vWorld;
flat out vec3 vColor;
// the baked shade at the stamp (sky, moon) and the strikes' light the air scatters towards the eye before it
flat out vec2 vShade;
out vec3 vStrike;
const float GRAVITY = ${GRAVITY.toFixed(2)};
const int RING = ${RING};
const int PER_ROW = ${PER_ROW};
const int SPLASH_TEXELS = ${SPLASH_TEXELS};
// texel k of a slot's splash
uvec4 splashTexel(int slot, int k) {
  return texelFetch(uSplashes, ivec2((slot % PER_ROW) * SPLASH_TEXELS + k, slot / PER_ROW), 0);
}
void main() {
  int slot = uListed ? int(aDrop) : (uFirstSlot + gl_InstanceID / uAges) % RING;
  int age = gl_InstanceID % uAges;
  // (the stamp's step, and its count from the splash's first: differences of unsigned steps)
  uint s = uStep - uint(age);
  uvec4 ids = splashTexel(slot, 3);
  int k = int(s - ids.x);
  bool shown = k >= 0 && k < int(ids.y) && int(s - uFrom) > 0 && int(uTo - s) >= 0;
  vec4 start = vec4(0.0);
  vec3 place = vec3(0.0);
  if (shown) {
    start = uintBitsToFloat(splashTexel(slot, 0));
    vec4 speed = uintBitsToFloat(splashTexel(slot, 1));
    float t = float(k) / speed.w + start.w;
    // (the arc starts at the water's live height at the launch place and lands there: 0 with the waves off or calm)
    float lift = waveLiftAt(vec2(start.x, -start.y));
    place = vec3(start.x + speed.x * t, lift + max(0.0, speed.y * t - GRAVITY * t * t / 2.0), start.y + speed.z * t);
    shown = glyphShown(cViewProj * vec4(place.x, place.y * uMirror, place.z, 1.0));
  }
  vUv = vec2(aCorner.x, 1.0 - aCorner.y);
  vHead = age == 0 ? 1.0 : 0.0;
  if (!shown) {
    vGlyph = 0;
    vLight = 0.0;
    vWorld = vec3(0.0);
    vColor = vec3(0.0);
    vShade = vec2(0.0);
    vStrike = vec3(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vColor = uintBitsToFloat(splashTexel(slot, 2)).rgb;
  vGlyph = int(hash(ids.z + s * 977u) % uint(uGlyphs));
  // (the quad's footprint in pixels at its middle: under uPointPx it is drawn one pixel wide, its light times its area: the same
  // light over the pixels; only for a stamp whose brightest light is under POINT_PEAK_MAX, so a pixel is off by 4 levels at most)
  vec4 middle = cViewProj * vec4(place.x, place.y * uMirror, place.z, 1.0);
  float footprint = start.z * cEye.w / max(middle.w, 1e-6);
  float quadSize = start.z;
  float pointGain = 1.0;
  if (uPointPx > 0.0 && footprint <= uPointPx && footprint > 0.0) {
    quadSize = start.z / footprint;
    pointGain = footprint * footprint;
  }
  vec3 world = place + vec3((aCorner.x - 0.5) * quadSize, (aCorner.y - 0.5) * quadSize, 0.0);
  world.y *= uMirror;
  vec4 clip = cViewProj * vec4(world, 1.0);
  vWorld = world;
  vec4 fog = glyphFogStrike(world, clip, uMirror < 0.0);
  vLight = (1.0 - float(age) / float(uTrail)) * fog.a;
  vStrike = fog.rgb;
  // (level of detail: a stamp whose brightest light is under the floor is not drawn; the floor is 0 at full detail; the emission's light alone, as the CPU's stamp model has it
  // (QualitySplashes.stampPeak): the light the stamp reflects is under that light's fraction, the reflected light per unit of albedo, of the floor; the shade is read after the cut)
  float maxColor = max(vColor.r, max(vColor.g, vColor.b));
  float peak = age == 0 ? max(maxColor, 1.0) * uHeadPeak : maxColor;
  if (vLight * peak < uLodFloor) {
    vGlyph = 0;
    vLight = 0.0;
    vWorld = vec3(0.0);
    vColor = vec3(0.0);
    vShade = vec2(0.0);
    vStrike = vec3(0.0);
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // (the true place: not the mirror image's)
  vShade = glyphShade(place);
  if (pointGain < 1.0) {
    if (vLight * peak <= 0.01568627) {
      vLight *= pointGain;
    } else {
      // (too bright for a point: the quad as it is)
      vec3 whole = place + vec3((aCorner.x - 0.5) * start.z, (aCorner.y - 0.5) * start.z, 0.0);
      whole.y *= uMirror;
      clip = cViewProj * vec4(whole, 1.0);
      vWorld = whole;
    }
  }
  gl_Position = clip;
}