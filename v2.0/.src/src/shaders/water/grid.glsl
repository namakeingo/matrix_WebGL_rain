
const vec2 GRID_CELLS = vec2(${GRID_ACROSS}.0, ${GRID_DEEP}.0);
const float GRID_NEAR = ${GRID_NEAR.toFixed(2)};
const float GRID_LOG = ${Math.log(GRID_FAR / GRID_NEAR).toFixed(6)};
const float GRID_SCALE = ${GRID_SCALE.toFixed(1)};
const float GRID_SPAN = ${M.Camera.SPAN.toFixed(4)};
vec2 gridOf(vec3 s) {
  float z = max(-s.z, 1e-3);
  return vec2((s.x / z / GRID_SPAN + 1.0) * 0.5, log(z / GRID_NEAR) / GRID_LOG);
}
vec3 gridPlace(vec2 g) {
  float z = GRID_NEAR * exp(g.y * GRID_LOG);
  return vec3((g.x * 2.0 - 1.0) * GRID_SPAN * z, 0.0, -z);
}