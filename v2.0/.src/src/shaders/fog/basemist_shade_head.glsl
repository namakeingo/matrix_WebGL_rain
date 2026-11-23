// The base mist's shade grid bake (Feature U3, story M3; models/basemistshade.ts is its CPU model): the sky's and the Orb's light reaching a node through the static base density, through 4 places over 8 m as the front's through()
// takes it (no air: the front grid holds it): density = uBase e^(-max(y, 0) / HB) w(p), w the window of the fixed-offset noise of mean 1 at the cell's lod (M.StaticMist.baseNoise, meanOne). The value of a cell (sky, moon).
uniform float uBase;
const float BASE_HB = ${BASE_HB};
// the base noise: M.StaticMist.OCTAVES (the sizes 24, 10 and 4 m, the weights 0.55, 0.3 and 0.15, the fixed offsets), read at the lod
float baseNoise(vec3 p, float lod) {
  float n = 0.55 * textureLod(uNoise, p / 24.0 + vec3(0.61, 0.23, 0.37), max(0.0, lod - log2(24.0))).r;
  n += 0.3 * textureLod(uNoise, p / 10.0 + vec3(0.83, 0.47, 0.19), max(0.0, lod - log2(10.0))).r;
  n += 0.15 * textureLod(uNoise, p / 4.0 + vec3(0.29, 0.71, 0.53), max(0.0, lod - log2(4.0))).r;
  return n;
}
// the window's mean at the lod (M.StaticMist.windowMean(lod, 0) at 8, 9 and 10, linear between, held at the ends)
float baseWindowMean(float lod) {
  float l = clamp(lod, 8.0, 10.0) - 8.0;
  return l < 1.0 ? mix(${MEAN8}, ${MEAN9}, l) : mix(${MEAN9}, ${MEAN10}, l - 1.0);
}
float baseDensityAt(vec3 p, float lod) {
  return uBase * exp(-max(p.y, 0.0) / BASE_HB) * smoothstep(0.4, 0.6, baseNoise(p, lod)) / baseWindowMean(lod);
}
// exp(-(mean density at the 4 places 1, 3, 5 and 7 m along dir) x 8 m)
float baseThrough(vec3 p, vec3 dir, float lod) {
  float depth = 0.0;
  for (int i = 0; i < 4; i++) depth += baseDensityAt(p + dir * (2.0 * float(i) + 1.0), lod);
  return exp(-depth * 2.0);
}
vec4 baseShadeCell(vec3 p) {
  float lod = max(shadeLod(p), lodOf(2.0));
  float moon = 0.0;
  for (int i = 0; i < MOON_KERNEL; i++) moon += baseThrough(p, moonDirection(i), lod);
  return vec4(baseThrough(p, vec3(0.0, 1.0, 0.0), lod), moon / float(MOON_KERNEL), 0.0, 1.0);
}
