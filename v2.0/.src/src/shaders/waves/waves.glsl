
${GRID_GLSL}
uniform highp sampler2D uWaves;
uniform highp sampler2D uWaveMax;
uniform highp sampler2D uWaveBlocks;
float cellHeight(ivec2 c) {
  ivec2 n = ivec2(gridCells());
  if (c.x < 0 || c.y < 0 || c.x >= n.x || c.y >= n.y) return 0.0;
  return texelFetch(uWaves, c, 0).r;
}
// a place of the water (x, distance Z) on the grid, in cells
vec2 gridAt(vec2 xz) {
  return vec2((xz.x / xz.y + wGrid.z) / (2.0 * wGrid.z), (1.0 / wGrid.x - 1.0 / xz.y) / (1.0 / wGrid.x - 1.0 / wGrid.y)) * gridCells() - 0.5;
}
float waveHeight(vec2 xz) {
  if (xz.y <= 0.0) return 0.0;
  vec2 g = gridAt(xz);
  ivec2 i = ivec2(floor(g));
  vec2 f = g - floor(g);
  return mix(mix(cellHeight(i), cellHeight(i + ivec2(1, 0)), f.x), mix(cellHeight(i + ivec2(0, 1)), cellHeight(i + ivec2(1, 1)), f.x), f.y);
}
float highestWave() {
  return texelFetch(uWaveMax, ivec2(0), 0).r;
}
// the highest wave (by its size) of the block of 4 x 4 cells a place of the water is in (0 off the
// grid)
float blockTop(vec2 xz) {
  if (xz.y <= 0.0) return 0.0;
  ivec2 b = ivec2(floor((gridAt(xz) + 0.5) / 4.0));
  ivec2 n = textureSize(uWaveBlocks, 0);
  if (b.x < 0 || b.y < 0 || b.x >= n.x || b.y >= n.y) return 0.0;
  return texelFetch(uWaveBlocks, b, 0).r;
}
// the water's normal averaged over a footprint (its sizes in metres across x and along the distance,
// foot): the mean slope over a box is the difference of the heights at its two sides over its width
// (exact), taken at up to 4 places across the box's other side. A footprint under two cells, or
// none, gives the slope between the cells next to the place: the normal at the place itself.
vec3 waterNormalOver(vec2 xz, vec2 foot) {
  vec2 c = cellSize(xz.y);
  vec2 w = max(c, 0.5 * foot);
  int nz = clamp(int(ceil(w.y / c.y - 0.01)), 1, 4);
  int nx = clamp(int(ceil(w.x / c.x - 0.01)), 1, 4);
  float hx = 0.0;
  float hz = 0.0;
  // (one loop for both sums and both sides, so the height read's code is in the program once: the passes' pairs of places in the order a, b of each, the first nz pairs sum hx,
  // the next nx hz; the b side's height is subtracted: (hx + a) - b, within a rounding of hx + (a - b))
  int along = nz + nx;
  for (int q = 0; q < 2 * along; q++) {
    int m = q >> 1;
    bool onX = m < nz;
    int i = onX ? m : m - nz;
    float cnt = onX ? float(nz) : float(nx);
    float o = ((float(i) + 0.5) / cnt - 0.5) * 2.0 * (onX ? w.y : w.x);
    float side = (q & 1) == 0 ? 1.0 : -1.0;
    vec2 p = onX ? xz + vec2(side * w.x, o) : xz + vec2(o, side * w.y);
    float h = side * waveHeight(p);
    if (onX) hx += h; else hz += h;
  }
  hx /= float(nz) * 2.0 * w.x;
  hz /= float(nx) * 2.0 * w.y;
  return normalize(vec3(-hx, 1.0, hz));
}
vec3 waterNormal(vec2 xz) {
  return waterNormalOver(xz, vec2(0.0));
}