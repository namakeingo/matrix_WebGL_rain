
uniform highp sampler3D uNoise;
// light scattered more than once, as a share of the light around
const float MULTIPLE = ${MULTIPLE};
const float SHADE_TOP = ${SHADE_TOP.toFixed(1)};
const float SHADE_NEAR = ${SHADE_NEAR.toFixed(2)};
const float SHADE_LOG = ${Math.log(FOG_FAR / SHADE_NEAR).toFixed(6)};
const vec3 SHADE_CELLS = vec3(${SHADE_ACROSS}.0, ${SHADE_UP}.0, ${SHADE_DEEP}.0);
const float SHADE_SPAN = ${M.Camera.SPAN.toFixed(4)};
const float STRIKE_SLOTS = ${SLOTS}.0;
float lodOf(float metres) {
  return log2(max(metres * ${NOISE.toFixed(1)}, 1e-6));
}
float noise3(vec3 q, float size, float lod) {
  return textureLod(uNoise, q, max(0.0, lod - log2(size))).r;
}
float density(vec3 p, float lod) {
  // (none where even its densest is under 1e-5 per metre: high above the water)
  float scale = fParams.x * exp(-max(p.y, 0.0) / 4.0);
  if (scale < 1e-5) return 0.0;
  float t = fParams.y;
  float n = 0.55 * noise3(p / 24.0 + vec3(t * 0.004, 0.0, t * 0.0016), 24.0, lod)
    + 0.3 * noise3(p / 10.0 + vec3(-t * 0.0052, t * 0.0012, 0.31), 10.0, lod)
    + 0.15 * noise3(p / 4.0 + vec3(0.17, -t * 0.0024, t * 0.008), 4.0, lod);
  return scale * (0.2 + 0.8 * smoothstep(0.4, 0.6, n));
}
// the clouds' albedo at p: the two fog colors mixed by a noise of its own
vec3 albedoAt(vec3 p, float lod) {
  return mix(fMain.rgb, fSecond.rgb, smoothstep(0.3, 0.7, noise3(p / 40.0 + vec3(0.37, 0.11, 0.53), 40.0, lod)));
}
// how much light gets from p to q through the clouds and the air (n places along the way, each
// read at the level of their spacing at least)
float through(vec3 p, vec3 q, int n, float lod) {
  float len = length(q - p);
  float at = max(lod, lodOf(len / float(n)));
  float depth = 0.0;
  for (int i = 0; i < n; i++) {
    depth += density(mix(p, q, (float(i) + 0.5) / float(n)), at);
  }
  return exp(-(depth / float(n) + AIR) * len);
}
// how much light from a direction reaches p through the clouds (4 places over 8 m)
float lightThrough(vec3 p, vec3 dir, float lod) {
  return through(p, p + dir * 8.0, 4, lod);
}
float phaseHG(float c) {
  float g = ${PHASE_G};
  return (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5) / FOUR_PI;
}
// a place of the world on the shadow grid (0 to 1 each way: x / distance across the world's
// width, the height's square root, the distance's logarithm), as texture coordinates (its nodes,
// the texels' middles, on 0 and 1); and node n of the grid (0 to its cells - 1) in the world
vec3 shadeCoord(vec3 p) {
  float z = max(-p.z, SHADE_NEAR);
  vec3 g = clamp(vec3((p.x / z / SHADE_SPAN + 1.0) * 0.5, sqrt(max(p.y, 0.0) / SHADE_TOP), log(z / SHADE_NEAR) / SHADE_LOG), 0.0, 1.0);
  return (g * (SHADE_CELLS - 1.0) + 0.5) / SHADE_CELLS;
}
vec3 shadePlace(vec3 n) {
  vec3 g = n / (SHADE_CELLS - 1.0);
  float z = SHADE_NEAR * exp(g.z * SHADE_LOG);
  return vec3((g.x * 2.0 - 1.0) * SHADE_SPAN * z, g.y * g.y * SHADE_TOP, -z);
}
// the level for a cell of the grid at p (its width, height or depth, the largest)
float shadeLod(vec3 p) {
  float z = max(-p.z, SHADE_NEAR);
  float up = 2.0 * sqrt(max(p.y, 0.0) * SHADE_TOP) / (SHADE_CELLS.y - 1.0);
  return lodOf(max(max(2.0 * SHADE_SPAN * z / (SHADE_CELLS.x - 1.0), up), z * SHADE_LOG / (SHADE_CELLS.z - 1.0)));
}
// the moon's penumbra kernel: the directions over the disc (materials/sky.ts: MoonDisc.directions, the centre first, then the edge), the number of
// them the bake takes, and the most there are
const int MOON_KERNEL = ${MOON_KERNEL};
const int MOON_KERNEL_MAX = ${MOON_KERNEL_MAX};
${moonKernelConstants}
// the count of the kernel's directions, given at run time (0, never set outside the tests: MOON_KERNEL): a loop of a count the compiler knows is unrolled by
// Direct3D's compiler through ANGLE, each direction's march inlined
uniform int uMoonKernel;
vec3 moonDirection(int i) {
  if (i == 0) return MOON_K0;
  if (i == 1) return MOON_K1;
  if (i == 2) return MOON_K2;
  if (i == 3) return MOON_K3;
  return MOON_K4;
}
// what gets to p from the sky (x) and the moon (y) through the clouds, marched. The moon's: the mean over the
// kernel's directions of the light through 8 m of them (the count a value at run time, the constant most checked
// inside); the sky's is the same march with the direction up (i = -1), so the heavy march is called from one place
vec2 skyShadeMarched(vec3 p, float lod) {
  int n = uMoonKernel > 0 ? uMoonKernel : MOON_KERNEL;
  float sky = 0.0;
  float sum = 0.0;
  for (int i = -1; i < n; i++) {
    if (i >= MOON_KERNEL_MAX) break;
    float light = lightThrough(p, i < 0 ? vec3(0.0, 1.0, 0.0) : moonDirection(i), lod);
    if (i < 0) sky = light;
    else sum += light;
  }
  return vec2(sky, sum / float(min(n, MOON_KERNEL_MAX)));
}