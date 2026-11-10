#version 300 es
precision highp float;
uniform float uPush;
in vec2 vCentre;
in vec2 vSpread;
in float vKeep;
in vec2 vCell;
out vec4 outColor;
void main() {
  vec2 d = (gl_FragCoord.xy - vCentre) * vCell / vSpread;
  float r2 = dot(d, d);
  outColor = vec4(uPush * vKeep * (1.0 - 0.5 * r2) * exp(-0.5 * r2), 0.0, 0.0, 1.0);
}