#version 300 es
precision highp float;
uniform sampler2D uFrom;
uniform sampler2D uFromAdd;
uniform bool uAdd;
uniform bool uLinear;
out vec4 outColor;
vec3 texel(ivec2 p) {
  vec3 c = texelFetch(uFrom, p, 0).rgb;
  if (uAdd) c += texelFetch(uFromAdd, p, 0).rgb;
  return c;
}
void main() {
  ivec2 most = textureSize(uFrom, 0) - 1;
  ivec2 at = ivec2(gl_FragCoord.xy) * 2;
  if (uLinear) {
    outColor = vec4(textureLod(uFrom, (vec2(at) + 1.0) / vec2(most + 1), 0.0).rgb, 1.0);
    return;
  }
  vec3 sum = texel(min(at, most)) + texel(min(at + ivec2(1, 0), most)) + texel(min(at + ivec2(0, 1), most)) + texel(min(at + ivec2(1, 1), most));
  outColor = vec4(0.25 * sum, 1.0);
}