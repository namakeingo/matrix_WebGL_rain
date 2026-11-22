
// 1: the noise's octaves whose period is within the froxel's footprint are read as their mean (the texture's top mip), not fetched
uniform float uFar;
// the octaves (finest first: 4 m, 10 m, 24 m) of this slice read as their mean whatever the footprint (models/quality/fog.ts: Lod.levelOctaves)
uniform float uDrop;
const float TOP_MIP = ${QualityFog.TOP_MIP.toFixed(1)};
float noise3Far(vec3 q, float size, float lod, float rank, bool far) {
  float level = lod - log2(size);
  return far && (rank < uDrop || level >= TOP_MIP - 1e-3) ? 0.5 : textureLod(uNoise, q, max(0.0, level)).r;
}
// density(p, lod), the far octaves flat when far (the same sums, the same octaves' places; far false: exactly density(p, lod), so
// gather has one density call site)
float densityFar(vec3 p, float lod, bool far) {
  float scale = fParams.x * exp(-max(p.y, 0.0) / 4.0);
  if (scale < 1e-5) return 0.0;
  float t = fParams.y;
  float n = 0.55 * noise3Far(p / 24.0 + vec3(t * 0.004, 0.0, t * 0.0016), 24.0, lod, 2.0, far)
    + 0.3 * noise3Far(p / 10.0 + vec3(-t * 0.0052, t * 0.0012, 0.31), 10.0, lod, 1.0, far)
    + 0.15 * noise3Far(p / 4.0 + vec3(0.17, -t * 0.0024, t * 0.008), 4.0, lod, 0.0, far);
  return scale * (0.2 + 0.8 * smoothstep(0.4, 0.6, n));
}
vec4 gather(vec4 acc, vec3 o, vec3 d, float a, float b, bool mirrored, float lod, bool marched) {
  float dt = b - a;
  vec3 p = o + 0.5 * (a + b) * d;
  if (mirrored) p.y = -p.y;
  vec3 view = mirrored ? vec3(d.x, -d.y, d.z) : d;
  float sigma = densityFar(p, lod, uFar > 0.5 && !marched);
  // (the mist at the slice's middle like the clouds' density, one exponential: the closed form over the slice (mistMean, the tests' march's) cost the volume's full rebuild 7 ms; white scattering, so it is
  // part of the source as well)
  float mist = MIST_K * exp(-max(p.y, 0.0) / MIST_HEIGHT);
  float extinction = sigma + AIR_EXTINCTION + mist;
  vec3 source = sigma + mist > 1e-6 ? fogLight(p, view, lod, marched, sigma, mist) : vec3(0.0);
  float pass = exp(-extinction * dt);
  // acc.a is the optical depth so far, not the transmittance: the sums and the volume are half floats written rounded down, and a product of per-slice
  // transmittances near 1 loses a whole step (1/2048) every slice (4.7% over 96 slices in clear air); a sum of optical depths loses at most a step of its own size
  acc.rgb += exp(-acc.a) * source * (1.0 - pass) / extinction;
  acc.a += extinction * dt;
  return acc;
}
