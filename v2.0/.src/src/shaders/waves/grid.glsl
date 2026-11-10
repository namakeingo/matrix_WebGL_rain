
layout(std140) uniform Waves {
  vec4 wGrid;     // the grid's nearest and furthest distances, its half width (x / Z), its cells across
  vec4 wCells;    // its cells down
};
vec2 gridCells() {
  return vec2(wGrid.w, wCells.x);
}
vec2 cellSize(float z) {
  return vec2(z * 2.0 * wGrid.z, z * z * (1.0 / wGrid.x - 1.0 / wGrid.y)) / gridCells();
}