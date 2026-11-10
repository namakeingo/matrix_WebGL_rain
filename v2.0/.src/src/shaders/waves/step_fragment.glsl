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
float heightAt(ivec2 c) {
  ivec2 n = ivec2(gridCells());
  if (c.x < 0 || c.y < 0 || c.x >= n.x || c.y >= n.y) return 0.0;
  return texelFetch(uState, c, 0).r;
}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 s = texelFetch(uState, c, 0).rg;
  float h = s.x;
  float speed = s.y;
  if (uWithImpulse) speed -= texelFetch(uImpulse, c, 0).r;
  float v = (float(c.y) + 0.5) / wCells.x;
  vec2 cell = cellSize(1.0 / (1.0 / wGrid.x - v * (1.0 / wGrid.x - 1.0 / wGrid.y)));
  float across = (heightAt(c - ivec2(1, 0)) + heightAt(c + ivec2(1, 0)) - 2.0 * h) / (cell.x * cell.x);
  float down = (heightAt(c - ivec2(0, 1)) + heightAt(c + ivec2(0, 1)) - 2.0 * h) / (cell.y * cell.y);
  // the waves die out near the grid's sides
  vec2 fromSide = min(vec2(c), gridCells() - 1.0 - vec2(c));
  float edge = 1.0 - clamp(min(fromSide.x, fromSide.y) / EDGE, 0.0, 1.0);
  float damp = uDamp * (1.0 - uEdgeLoss * edge * edge);
  speed = (speed + uCdt * uCdt * (across + down)) * damp;
  h = (h + speed) * damp;
  outColor = vec4(h, speed, 0.0, 1.0);
}