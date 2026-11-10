#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2DArray;
uniform sampler2DArray uAtlas;
uniform float uMirror;
${M.Camera.GLSL}
${glsl.waves}
in vec2 vUv;
flat in int vGlyph;
in float vLight;
in vec3 vWorld;
flat in float vCover;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outCover;
layout(location = 2) out vec4 outNear;
const float NEAR_SCALE = ${NEAR_SCALE.toFixed(1)};
void main() {
  float ink = texture(uAtlas, vec3(vUv, float(vGlyph))).r;
  if (ink <= 0.0 || vCover <= 0.0 || (abs(vWorld.y) < highestWave() && abs(vWorld.y) < waveHeight(vec2(vWorld.x, -vWorld.z)))) discard;
  bool mirrored = uMirror < 0.0;
  float c = ink * vCover;
  outColor = vec4(0.0);
  outCover = mirrored ? vec4(0.0, 0.0, 0.0, c) : vec4(0.0, c, 0.0, 0.0);
  // (its nearness the line's under it)
  outNear = vec4(0.0);
}