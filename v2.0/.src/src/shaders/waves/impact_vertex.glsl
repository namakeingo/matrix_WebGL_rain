#version 300 es
precision highp float;
${GRID_GLSL}
uniform float uSize;
in vec2 aCorner;
in vec3 aImpact;
out vec2 vCentre;
out vec2 vSpread;
out float vKeep;
out vec2 vCell;
void main() {
  float z = -aImpact.y;
  vec2 g = vec2((aImpact.x / z + wGrid.z) / (2.0 * wGrid.z), (1.0 / wGrid.x - 1.0 / z) / (1.0 / wGrid.x - 1.0 / wGrid.y)) * gridCells();
  vec2 cell = cellSize(z);
  float size = uSize * aImpact.z;
  vec2 spread = max(vec2(size), cell * 0.7);
  vKeep = (size / spread.x) * (size / spread.y);
  vCentre = g;
  vSpread = spread;
  vCell = cell;
  vec2 at = g + (aCorner * 2.0 - 1.0) * (4.0 * spread / cell + 1.0);
  gl_Position = z > 0.0 ? vec4(at / gridCells() * 2.0 - 1.0, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}