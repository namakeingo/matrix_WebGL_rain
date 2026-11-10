#version 300 es
precision highp float;
precision highp int;
${GRID_GLSL}
uniform highp sampler2D uState;
uniform highp sampler2D uImpulse;
uniform bool uWithImpulse;
uniform float uCdt;
uniform float uDamp;
uniform float uEdgeLoss;
out vec4 outColor;
const float EDGE = ${EDGE.toFixed(1)};
// two steps of step_fragment.glsl in one draw: the first step is made at the cell and at its four neighbours (each with its own damping and row sizes; a
// neighbour off the grid has no state, so its intermediate height is 0 as heightAt gives off the grid), the second at the cell from those
bool onGrid(ivec2 c) {
  ivec2 n = ivec2(gridCells());
  return c.x >= 0 && c.y >= 0 && c.x < n.x && c.y < n.y;
}
vec2 stateAt(ivec2 c) {
  return onGrid(c) ? texelFetch(uState, c, 0).rg : vec2(0.0);
}
float pushAt(ivec2 c) {
  return uWithImpulse ? texelFetch(uImpulse, c, 0).r : 0.0;
}
// a row's cells' sizes squared
vec2 cellSq(int y) {
  float v = (float(y) + 0.5) / wCells.x;
  vec2 cell = cellSize(1.0 / (1.0 / wGrid.x - v * (1.0 / wGrid.x - 1.0 / wGrid.y)));
  return cell * cell;
}
// the waves die out near the grid's sides
float dampAt(ivec2 c) {
  vec2 fromSide = min(vec2(c), gridCells() - 1.0 - vec2(c));
  float edge = 1.0 - clamp(min(fromSide.x, fromSide.y) / EDGE, 0.0, 1.0);
  return uDamp * (1.0 - uEdgeLoss * edge * edge);
}
// the first step at a cell p: its height hn and speed sn, its left, right, lower and upper neighbours' heights, its row's cells' sizes squared; the new speed
// and height (0 off the grid)
vec2 first(ivec2 p, float hn, float sn, float hl, float hr, float hd, float hu, vec2 cell2) {
  if (!onGrid(p)) return vec2(0.0);
  float across = (hl + hr - 2.0 * hn) / cell2.x;
  float down = (hd + hu - 2.0 * hn) / cell2.y;
  float damp = dampAt(p);
  float speed = ((sn - pushAt(p)) + uCdt * uCdt * (across + down)) * damp;
  return vec2(speed, (hn + speed) * damp);
}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 C = stateAt(c);
  vec2 W = stateAt(c + ivec2(-1, 0));
  vec2 E = stateAt(c + ivec2(1, 0));
  vec2 S = stateAt(c + ivec2(0, -1));
  vec2 N = stateAt(c + ivec2(0, 1));
  float WW = stateAt(c + ivec2(-2, 0)).x;
  float EE = stateAt(c + ivec2(2, 0)).x;
  float SS = stateAt(c + ivec2(0, -2)).x;
  float NN = stateAt(c + ivec2(0, 2)).x;
  float SW = stateAt(c + ivec2(-1, -1)).x;
  float SE = stateAt(c + ivec2(1, -1)).x;
  float NW = stateAt(c + ivec2(-1, 1)).x;
  float NE = stateAt(c + ivec2(1, 1)).x;
  vec2 row = cellSq(c.y);
  vec2 rowDown = cellSq(c.y - 1);
  vec2 rowUp = cellSq(c.y + 1);
  vec2 pc = first(c, C.x, C.y, W.x, E.x, S.x, N.x, row);
  vec2 pw = first(c + ivec2(-1, 0), W.x, W.y, WW, C.x, SW, NW, row);
  vec2 pe = first(c + ivec2(1, 0), E.x, E.y, C.x, EE, SE, NE, row);
  vec2 ps = first(c + ivec2(0, -1), S.x, S.y, SW, SE, SS, C.x, rowDown);
  vec2 pn = first(c + ivec2(0, 1), N.x, N.y, NW, NE, C.x, NN, rowUp);
  float across = (pw.y + pe.y - 2.0 * pc.y) / row.x;
  float down = (ps.y + pn.y - 2.0 * pc.y) / row.y;
  float damp = dampAt(c);
  float speed = (pc.x + uCdt * uCdt * (across + down)) * damp;
  float h = (pc.y + speed) * damp;
  outColor = vec4(h, speed, 0.0, 1.0);
}
