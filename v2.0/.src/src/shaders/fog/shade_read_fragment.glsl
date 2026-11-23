#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
${M.Camera.GLSL}
${Fog.GLSL}
${Fog.MEDIUM_GLSL}
${Fog.SHADE_GLSL}
// (the tests only) the one read of the combined shade, skyShade of a point of the world, out through one pixel of a float picture
uniform vec3 uPoint;
layout(location = 0) out vec4 outColor;
void main() {
  outColor = vec4(skyShade(uPoint, 0.0, false), 0.0, 1.0);
}
