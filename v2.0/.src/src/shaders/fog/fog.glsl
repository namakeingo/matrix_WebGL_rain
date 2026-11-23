
layout(std140) uniform Fog {
  vec4 fParams;   // the density's scale (per metre), the time, whether the volume is there,
                  // whether the strikes' light is (z: -1 with Distance fog off)
  vec4 fMain;     // the clouds' main colour (rgb); w: the front cloud's tail share t (frontProfile in medium.glsl)
  vec4 fSecond;   // the clouds' second colour (rgb); w: 0 without the base mist's volume (strength 0, Distance fog off), 1 with it, 2 with it and its shade (the shade texture's base layers)
  vec4 fVolume;   // its columns across and down, a column's width in pixels, its margin
  vec4 fStrikes;  // each slot's light over STRIKE_SCALE
  vec4 fBolt;     // the strikes' color (rgb); w: the tests' march's segments
  vec4 fMoonGain; // the Orb's light's gain per channel (rgb), linear; w: the front cloud's tail scale Hf in metres
};
uniform highp sampler3D uFogDirect;
uniform highp sampler3D uFogMirror;
// the base mist's volume is the layers SLICES to SLICES + BASE_SLICES - 1 of the same pair of textures (the context has no free texture unit)
#define uBaseMist uFogDirect
#define uBaseMistMirror uFogMirror
uniform highp sampler3D uStrikeDirect;
uniform highp sampler3D uStrikeMirror;
const float FOG_FAR = ${FOG_FAR.toFixed(1)};
const float PI = 3.14159265;
const float FOUR_PI = 12.5663706;
// the clear air's scattering and extinction per metre at the ground (the atmosphere's, luminance-weighted: materials/fog.ts)
const float AIR_SCATTER = ${AIR_SCATTER};
const float AIR_EXTINCTION = ${AIR_EXTINCTION};
// the Orb's irradiance at the ground (the moonlight through the cloud cover), from MOON_DIR; the sky, seen and lighting the fog and the water, is the atmosphere's (below)
const vec3 MOON_BASE = vec3(${MOON.map((v) => v.toFixed(2)).join(", ")});
#define MOON (MOON_BASE * fMoonGain.xyz)
const vec3 MOON_DIR = vec3(${MOON_DIR.map((v) => v.toFixed(2)).join(", ")});
// the moon's disc: its angular radius and solid angle (pi r^2), and its radiance (the irradiance MOON over the solid angle)
const float MOON_RADIUS = ${MOON_RADIUS.toFixed(6)};
const float MOON_SOLID_ANGLE = ${MOON_SOLID_ANGLE.toExponential(6)};
#define MOON_RADIANCE (MOON / MOON_SOLID_ANGLE)
${ATMOSPHERE_GLSL}
// the aerial perspective beyond the volume: only the programs that define AERIAL compile it (the water's)
#ifdef AERIAL
${AERIAL_GLSL}
#endif
// the atmosphere's light on a surface with the unit normal n, per unit albedo: the sky's spherical harmonics (atmosDiffuse), times skyShade (the baked transmittance of the
// clouds towards the sky)
vec3 skyIrradiance(vec3 n, float skyShade) {
  return atmosDiffuse(n) * skyShade;
}
// the baked sky's and moon's light on a surface with the unit normal n, per unit albedo, from the one read of the shade bake's two channels (shade.x
// towards the sky, shade.y towards the moon): the atmosphere's term and the Orb's MOON x max(n.m, 0) / pi
vec3 glyphSkyMoonLight(vec3 n, vec2 shade) {
  return skyIrradiance(n, shade.x) + MOON * max(dot(n, normalize(MOON_DIR)), 0.0) / PI * shade.y;
}
// the strikes' color (Lightning flash hue)
#define BOLT (fBolt.rgb)
const float SLICES = ${SLICES.toFixed(1)};
const float SLICE_NEAR = ${SLICE_NEAR.toFixed(1)};
// the base mist's volume: its slices, the far end of its reach and the logarithm of its slice law (the same law as the front's), and the layers of the stack
const float BASE_FAR = ${BASE_FAR.toFixed(1)};
const float BASE_SLICES = ${BASE_SLICES.toFixed(1)};
const float BASE_LOG = ${BASE_LOG.toFixed(6)};
const float FOG_LAYERS = ${FOG_LAYERS.toFixed(1)};
// the middle of the cut layer's texel: each column's built base slice count, in red (the layer after the base's)
const float BASE_CUT_Z = ${BASE_CUT_Z.toFixed(8)};
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
  // (z: 1 the volume is there, 0 it is not made yet or there are no float pictures (the air alone, to the volume's far end: the air beyond is aerialSpan's), -1 Distance fog is off: nothing in the way)
  if (fParams.z < -0.5) return vec4(0.0, 0.0, 0.0, 1.0);
  if (fParams.z < 0.5) {
    return vec4(0.0, 0.0, 0.0, exp(-AIR_EXTINCTION * min(t, FOG_FAR)));
  }
  float f = log(1.0 + min(t, FOG_FAR) / SLICE_NEAR) / SLICE_LOG * SLICES;
  vec3 c = vec3(columnAt(at), (max(f, 1.0) - 0.5) / SLICES);
  // (the front cloud's layers are the first of the stack, the base mist's follow: one pair of textures, one unit each)
  vec3 cf = vec3(c.xy, (max(f, 1.0) - 0.5) / FOG_LAYERS);
  vec4 v = mirrored ? textureLod(uFogMirror, cf, 0.0) : textureLod(uFogDirect, cf, 0.0);
  // (the volume holds the optical depth in a: what it lets through is its exponential)
  v.a = exp(-v.a);
  if (fParams.w > 0.5) {
    // (each slot's stack of slices, as much as its light now)
${strikeTerms}
    strike *= BOLT;
    v.rgb += strike;
  }
  if (f < 1.0) {
    strike *= f;
    v = mix(vec4(0.0, 0.0, 0.0, 1.0), v, f);
  }
  // (the base mist's volume, to BASE_FAR: what the front cloud's ray lets through is what lies behind it, so the base mist's light is attenuated by it and the transmittances multiply; the sky's pixels are
  // read at BASE_FAR, the water's at its hit; fSecond.w is 0 where the volume is not there: Fog intensity 1, Distance fog off)
  if (fSecond.w > 0.5) {
    float fb = log(1.0 + min(t, BASE_FAR) / SLICE_NEAR) / BASE_LOG * BASE_SLICES;
    // (the cells past a column's cut are never built: the read stops at the cut)
    float cut = textureLod(uBaseMist, vec3(c.xy, BASE_CUT_Z), 0.0).r;
    fb = min(fb, cut);
    vec3 cb = vec3(c.xy, (SLICES + max(fb, 1.0) - 0.5) / FOG_LAYERS);
    vec4 b = mirrored ? textureLod(uBaseMistMirror, cb, 0.0) : textureLod(uBaseMist, cb, 0.0);
    b.a = exp(-b.a);
    if (fb < 1.0) b = mix(vec4(0.0, 0.0, 0.0, 1.0), b, fb);
    v.rgb += v.a * b.rgb;
    v.a *= b.a;
  }
  return v;
}
vec4 fogAt(vec2 at, float t, bool mirrored) {
  vec3 strike;
  return fogAt(at, t, mirrored, strike);
}