#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
${M.Camera.GLSL}
${glsl.fog}
uniform sampler2D uBoltCover;
uniform highp sampler2D uBoltNear;
uniform bool uInFront;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outReflected;
const float NEAR_SCALE = ${NEAR_SCALE.toFixed(1)};
const float COVER = ${COVER.toFixed(4)};
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec2 c = texelFetch(uBoltCover, at, 0).rg;
  vec4 sums = texelFetch(uBoltNear, at, 0);
  float near = sums.b > 0.0 ? sums.r / sums.b : 0.0;
  float cover = 1.0 - (1.0 - min(c.x, COVER)) * (1.0 - c.y);
  if (cover <= 0.0 || near <= 0.0) discard;
  vec3 strike = vec3(0.0);
  vec3 front = vec3(0.0);
  if (uInFront) {
    front = fogAt(gl_FragCoord.xy, NEAR_SCALE / near, false, strike).rgb;
  }
  outColor = vec4(cover * front, cover);
  outReflected = vec4(cover * strike, cover);
}