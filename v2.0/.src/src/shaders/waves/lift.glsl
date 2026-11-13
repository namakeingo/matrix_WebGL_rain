// Where a splash starts and a bolt's foot stands, and where the rain's head ends its fall in a trough, the vertex shaders meet the waves' live height (models/wavelift.ts is the script's twin). A lean read of the waves for the vertex stage (the fragment stage's full text,
// waves.glsl, carries the water's normal and the blocks too, and a vertex program pays for each function it compiles): the same block, samplers and bilinear height, ONE read of four cells
// with the cells clamped to the grid (off the grid the waves have died out: the edge cells are damped to nothing), the highest wave, the switch and the splashes' and the bolt's reach.
${GRID_GLSL}
uniform highp sampler2D uWaves;
uniform highp sampler2D uWaveMax;
// 1 when the water shows waves (the Collision plane and Ripples on), set by each effect from the water's state: 0 leaves the water flat, y = 0
uniform float uWaterWaves;
// the highest wave (m) under which the water counts as calm (WaveLift.CALM)
const float WAVE_CALM = ${WAVE_CALM};
float highestWave() {
  return texelFetch(uWaveMax, ivec2(0), 0).r;
}
// the water's height at a place (x, distance): bilinear between the cells' middles
float waveHeight(vec2 xz) {
  if (xz.y <= 0.0) {
    return 0.0;
  }
  vec2 g = vec2((xz.x / xz.y + wGrid.z) / (2.0 * wGrid.z), (1.0 / wGrid.x - 1.0 / xz.y) / (1.0 / wGrid.x - 1.0 / wGrid.y)) * gridCells() - 0.5;
  vec2 f = g - floor(g);
  ivec2 last = ivec2(gridCells()) - 1;
  ivec2 lo = clamp(ivec2(floor(g)), ivec2(0), last);
  ivec2 hi = clamp(ivec2(floor(g)) + 1, ivec2(0), last);
  return mix(mix(texelFetch(uWaves, lo, 0).r, texelFetch(uWaves, ivec2(hi.x, lo.y), 0).r, f.x), mix(texelFetch(uWaves, ivec2(lo.x, hi.y), 0).r, texelFetch(uWaves, hi, 0).r, f.x), f.y);
}
#ifdef WAVE_LIFT_AT
// the metres over the floor a splash's start or a bolt's foot is lifted over (the highest wave and one cell); 0 when there is nothing to lift by: one read of the highest wave
float waveReach(float cell) {
  if (uWaterWaves < 0.5) {
    return 0.0;
  }
  float top = highestWave();
  return top < WAVE_CALM ? 0.0 : top + cell;
}
// the wave's height at a place of the water (x, distance); 0 when the waves are off or calm
float waveLiftAt(vec2 xz) {
  return waveReach(0.0) > 0.0 ? waveHeight(xz) : 0.0;
}
#endif
