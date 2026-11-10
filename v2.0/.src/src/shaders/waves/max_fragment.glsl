#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uFrom;
uniform bool uFirst;
// the result raised: (highest + uAdd) x (1 + uGrow); both 0 in the chain's passes
uniform float uAdd;
uniform float uGrow;
out vec4 outColor;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy) * 4;
  ivec2 n = textureSize(uFrom, 0);
  float m = 0.0;
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      float v = texelFetch(uFrom, min(c + ivec2(i, j), n - 1), 0).r;
      m = max(m, uFirst ? abs(v) : v);
    }
  }
  outColor = vec4((m + uAdd) * (1.0 + uGrow), 0.0, 0.0, 1.0);
}