#version 300 es
precision highp float;
uniform sampler2D uFrom;
uniform ivec2 uStep;
out vec4 outColor;
const int TAPS = ${TAPS};
const float SIGMA = ${SIGMA.toFixed(1)};
void main() {
  ivec2 most = textureSize(uFrom, 0) - 1;
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = -TAPS; i <= TAPS; i++) {
    float x = float(i) / SIGMA;
    float w = exp(-0.5 * x * x);
    sum += w * texelFetch(uFrom, clamp(at + uStep * i, ivec2(0), most), 0).rgb;
    total += w;
  }
  outColor = vec4(sum / total, 1.0);
}