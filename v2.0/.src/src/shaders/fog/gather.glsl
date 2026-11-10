
// 1: the noise's octaves whose period is within the froxel's footprint are read as their mean (the texture's top mip), not fetched
uniform float uFar;
// the octaves (finest first: 4 m, 10 m, 24 m) of this slice read as their mean whatever the footprint (models/quality/fog.ts: Lod.levelOctaves)
uniform float uDrop;
const float TOP_MIP = ${QualityFog.TOP_MIP.toFixed(1)};
float noise3Far(vec3 q, float size, float lod, float rank) {
  float level = lod - log2(size);
  return rank < uDrop || level >= TOP_MIP - 1e-3 ? 0.5 : textureLod(uNoise, q, max(0.0, level)).r;
}
// density(p, lod) with the far octaves flat (the same sums, the same octaves' places)
float densityFar(vec3 p, float lod) {
  float scale = fParams.x * exp(-max(p.y, 0.0) / 4.0);
  if (scale < 1e-5) return 0.0;
  float t = fParams.y;
  float n = 0.55 * noise3Far(p / 24.0 + vec3(t * 0.004, 0.0, t * 0.0016), 24.0, lod, 2.0)
    + 0.3 * noise3Far(p / 10.0 + vec3(-t * 0.0052, t * 0.0012, 0.31), 10.0, lod, 1.0)
    + 0.15 * noise3Far(p / 4.0 + vec3(0.17, -t * 0.0024, t * 0.008), 4.0, lod, 0.0);
  return scale * (0.2 + 0.8 * smoothstep(0.4, 0.6, n));
}
vec4 gather(vec4 acc, vec3 o, vec3 d, float a, float b, bool mirrored, float lod, bool marched) {
  float dt = b - a;
  vec3 p = o + 0.5 * (a + b) * d;
  if (mirrored) p.y = -p.y;
  vec3 view = mirrored ? vec3(d.x, -d.y, d.z) : d;
  float sigma = uFar > 0.5 && !marched ? densityFar(p, lod) : density(p, lod);
  float extinction = sigma + AIR;
  vec3 source = sigma > 0.0 ? sigma * fogLight(p, view, lod, marched) : vec3(0.0);
  float pass = exp(-extinction * dt);
  acc.rgb += acc.a * source * (1.0 - pass) / extinction;
  acc.a *= pass;
  return acc;
}
