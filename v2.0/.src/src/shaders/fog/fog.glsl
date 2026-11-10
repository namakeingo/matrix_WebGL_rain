
layout(std140) uniform Fog {
  vec4 fParams;   // the density's scale (per metre), the time, whether the volume is there,
                  // whether the strikes' light is (z: -1 with Distance fog off)
  vec4 fMain;
  vec4 fSecond;
  vec4 fVolume;   // its columns across and down, a column's width in pixels, its margin
  vec4 fStrikes;  // each slot's light over STRIKE_SCALE
  vec4 fBolt;     // the strikes' color (rgb); w: the tests' march's segments
  vec4 fSkyGain;  // the sky's light's gain per channel (rgb), linear
  vec4 fMoonGain; // the moon's
};
uniform highp sampler3D uFogDirect;
uniform highp sampler3D uFogMirror;
uniform highp sampler3D uStrikeDirect;
uniform highp sampler3D uStrikeMirror;
const float FOG_FAR = ${FOG_FAR.toFixed(1)};
const float PI = 3.14159265;
const float FOUR_PI = 12.5663706;
// the air's scattering and extinction per metre
const float AIR = ${AIR};
// the night sky's radiance (seen, and lighting the fog and the water), and the moonlight's
// irradiance through the cloud cover, from MOON_DIR
const vec3 SKY_BASE = vec3(${SKY.join(", ")});
const vec3 MOON_BASE = vec3(${MOON.map((v) => v.toFixed(2)).join(", ")});
#define SKY (SKY_BASE * fSkyGain.xyz)
#define MOON (MOON_BASE * fMoonGain.xyz)
const vec3 MOON_DIR = vec3(${MOON_DIR.map((v) => v.toFixed(2)).join(", ")});
// the strikes' color (Lightning flash hue)
#define BOLT (fBolt.rgb)
const float SLICES = ${SLICES.toFixed(1)};
const float SLICE_NEAR = ${SLICE_NEAR.toFixed(1)};
const float SLICE_LOG = ${Math.log(1 + FOG_FAR / SLICE_NEAR).toFixed(6)};
const float STRIKE_SCALE = ${STRIKE_SCALE.toFixed(1)};
const float STRIKE_STACKS = ${SLOTS}.0;
// the distance from the eye of a slice's boundary (u = k / SLICES)
float sliceAt(float u) {
  return SLICE_NEAR * (exp(u * SLICE_LOG) - 1.0);
}
// a place of the screen (pixels from the bottom left; past its sides as far as the margin) as the
// volumes' coordinates across and down
vec2 columnAt(vec2 at) {
  return (at / cScreen.xy + fVolume.w) / (1.0 + 2.0 * fVolume.w);
}
// the ray through a column's middle
vec3 columnRay(vec2 fc) {
  return rayOf(((fc / fVolume.xy) * (1.0 + 2.0 * fVolume.w) - fVolume.w) * cScreen.xy);
}
// a slot's light per unit (its color) at volume coordinates c, from its stack of slices
vec3 strikeStack(vec3 c, float slot, bool mirrored) {
  vec3 k = vec3(c.xy, (slot + c.z) / STRIKE_STACKS);
  return (mirrored ? textureLod(uStrikeMirror, k, 0.0) : textureLod(uStrikeDirect, k, 0.0)).rgb;
}
// what the medium gives along the ray through a place of the screen, from the eye to the
// distance t: its light (rgb, the strikes' with it) and what it lets through (a); mirrored: along
// the ray's mirror image below the water, from where it meets still water. With strike: the
// strikes' share of that light alone (the light of the emitters it scatters: the bloom's source;
// the sky's and the moon's left out)
vec4 fogAt(vec2 at, float t, bool mirrored, out vec3 strike) {
  strike = vec3(0.0);
  // (z: 1 the volume is there, 0 it is not made yet (the air alone), -1 Distance fog is off: nothing in the way)
  if (fParams.z < -0.5) return vec4(0.0, 0.0, 0.0, 1.0);
  if (fParams.z < 0.5) return vec4(0.0, 0.0, 0.0, exp(-AIR * t));
  float f = log(1.0 + min(t, FOG_FAR) / SLICE_NEAR) / SLICE_LOG * SLICES;
  vec3 c = vec3(columnAt(at), (max(f, 1.0) - 0.5) / SLICES);
  vec4 v = mirrored ? textureLod(uFogMirror, c, 0.0) : textureLod(uFogDirect, c, 0.0);
  if (fParams.w > 0.5) {
    // (each slot's stack of slices, as much as its light now)
${strikeTerms}
    strike *= BOLT;
    v.rgb += strike;
  }
  if (f < 1.0) {
    strike *= f;
    return mix(vec4(0.0, 0.0, 0.0, 1.0), v, f);
  }
  return v;
}
vec4 fogAt(vec2 at, float t, bool mirrored) {
  vec3 strike;
  return fogAt(at, t, mirrored, strike);
}