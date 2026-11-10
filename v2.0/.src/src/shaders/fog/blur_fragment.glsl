#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
uniform sampler3D uFrom;
uniform int uLayer;
uniform int uAxis;
out vec4 outColor;
void main() {
  ivec3 c = ivec3(ivec2(gl_FragCoord.xy), uLayer);
  ivec3 step = uAxis == 0 ? ivec3(1, 0, 0) : (uAxis == 1 ? ivec3(0, 1, 0) : ivec3(0, 0, 1));
  float sum = 0.0;
  for (int k = -2; k <= 2; k++) {
    sum += texelFetch(uFrom, (c + k * step + ${NOISE}) % ${NOISE}, 0).r;
  }
  outColor = vec4(sum / 5.0, 0.0, 0.0, 1.0);
}