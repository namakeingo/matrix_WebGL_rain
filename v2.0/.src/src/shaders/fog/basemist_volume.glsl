#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
${M.Camera.GLSL}
${Fog.GLSL}
${Fog.MEDIUM_GLSL}
${Fog.SHADE_GLSL}
// The base mist's slice (Feature U3, story M2; engine/basemist.ts): the fresh slice of the base mist's volume, the sums so far from the slice before (the previous pair of pictures) on to this slice's far end, at
// a reduced number of columns and with the sample's place moved by the frame's jitter (the exact build: the full columns, no jitter). The base mist is static: its density is
// BASE e^(-max(y, 0) / HB) m(p), m the fixed-offset noise window of mean 1 (models/staticmist.ts: baseNoise, modulation), coarsened with the distance by this slice's constants (uCoarse); no time enters.
// It holds no air (the front volume's air is counted once). Its light is the front cloud's fogLight over the base density (the sky's and the Orb's shade as baked, the clouds' albedo mix at the same lod).
uniform int uSlice;
// xy: the columns of the full volume that one column of this picture covers, minus 1 (0: the full volume's own columns); zw: the sample's offset in this picture's columns (0: the column's middle)
uniform vec4 uAccum;
// the sample's place in the slice along the ray, 0 to 1 (0.5: the middle)
uniform float uAccumZ;
// this slice's coarsening: x the noise's lod shift (M.StaticMist.coarsen: lodShift), y the modulation's amplitude, z the window's narrowing, w one over the window's mean at that lod and narrowing
uniform vec4 uCoarse;
// the base mist's extinction per metre at the water and at its densest: the equal split's base share of the Fog intensity's total (M.StaticMist.splitStrengths)
uniform float uBase;
uniform sampler2D uSumDirect;
uniform sampler2D uSumMirror;
const float BASE_HB = ${BASE_HB};
// the distance from the eye of a base slice's boundary (u = k / BASE_SLICES)
float baseSliceAt(float u) {
  return SLICE_NEAR * (exp(u * BASE_LOG) - 1.0);
}
// the density's noise at p: the three octaves at their fixed offsets (no time), read at the lod shift
float baseNoise(vec3 p, float lod) {
  // (M.StaticMist.OCTAVES: the sizes 24, 10 and 4 m, the weights 0.55, 0.3 and 0.15, the fixed offsets)
  float n = 0.55 * textureLod(uNoise, p / 24.0 + vec3(0.61, 0.23, 0.37), max(0.0, lod - log2(24.0))).r;
  n += 0.3 * textureLod(uNoise, p / 10.0 + vec3(0.83, 0.47, 0.19), max(0.0, lod - log2(10.0))).r;
  n += 0.15 * textureLod(uNoise, p / 4.0 + vec3(0.29, 0.71, 0.53), max(0.0, lod - log2(4.0))).r;
  return n;
}
// the density's modulation m(p) (mean 1 over the noise, 1 where the distance has coarsened the field away)
float baseModulation(vec3 p) {
  // (amplitude 0: the modulation is exactly 1 whatever the noise: the flat level, the noise is not read)
  if (uCoarse.y <= 0.0) return 1.0;
  float n = baseNoise(p, uCoarse.x);
  float w = smoothstep(0.4 - 0.1 * uCoarse.z, 0.6 - 0.2 * uCoarse.z, n);
  return 1.0 + uCoarse.y * (w * uCoarse.w - 1.0);
}
// gather.glsl's gather for the base mist: the slice's medium taken at t of the slice (0 to 1) along the ray
vec4 baseGather(vec4 acc, vec3 o, vec3 d, float a, float b, float t, bool mirrored) {
  float dt = b - a;
  vec3 p = o + (a + t * dt) * d;
  if (mirrored) p.y = -p.y;
  vec3 view = mirrored ? vec3(d.x, -d.y, d.z) : d;
  float density = uBase * exp(-max(p.y, 0.0) / BASE_HB) * baseModulation(p);
  if (density < 1e-9) return acc;
  vec3 source = fogLight(p, view, uCoarse.x, false, density);
  float pass = exp(-density * dt);
  // (acc.a is the optical depth so far: see gather.glsl)
  acc.rgb += exp(-acc.a) * source * (1.0 - pass) / density;
  acc.a += density * dt;
  return acc;
}
layout(location = 0) out vec4 outDirect;
layout(location = 1) out vec4 outMirror;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 w = 1.0 + uAccum.xy;
  vec2 fc = (gl_FragCoord.xy + uAccum.zw) * w;
  vec3 d = columnRay(fc);
  float a = baseSliceAt(float(uSlice) / BASE_SLICES);
  float b = baseSliceAt(float(uSlice + 1) / BASE_SLICES);
  vec4 direct = uSlice == 0 ? vec4(0.0) : texelFetch(uSumDirect, c, 0);
  vec4 mirror = uSlice == 0 ? vec4(0.0) : texelFetch(uSumMirror, c, 0);
  // (the direct ray, then the mirrored one from where it meets still water: one gather site in a loop of a count given at run time, so its code is in the program once)
  int rays = d.y < 0.0 ? 2 : 1;
  for (int k = 0; k < rays; k++) {
    if (k >= 2) break;
    bool mirrored = k == 1;
    float from = a;
    if (mirrored) {
      from = max(a, cEye.y / -d.y);
      if (b <= from) break;
    }
    vec4 acc = baseGather(mirrored ? mirror : direct, cEye.xyz, d, from, b, uAccumZ, mirrored);
    if (mirrored) mirror = acc;
    else direct = acc;
  }
  outDirect = direct;
  outMirror = mirror;
}
