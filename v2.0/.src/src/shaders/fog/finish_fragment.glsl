#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
uniform sampler3D uFrom;
uniform int uLayer;
out vec4 outColor;
void main() {
  float v = texelFetch(uFrom, ivec3(ivec2(gl_FragCoord.xy), uLayer), 0).r;
  outColor = vec4(clamp(0.5 + (v - 0.5) * ${STRETCH.toFixed(1)}, 0.0, 1.0), 0.0, 0.0, 1.0);
}