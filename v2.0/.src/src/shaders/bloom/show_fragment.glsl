#version 300 es
precision highp float;
uniform sampler2D uFrom;
uniform sampler2D uFromAdd;
uniform bool uAdd;
uniform int uMode;
${Bloom.GLSL}
out vec4 outColor;
void main() {
  vec2 at = gl_FragCoord.xy;
  vec3 added = uAdd ? texelFetch(uFromAdd, ivec2(at), 0).rgb : vec3(0.0);
  vec3 light = texelFetch(uFrom, ivec2(at), 0).rgb + added;
  vec3 c = uMode == 0 ? bloomLevel(uBloom1, uBloomFirst, at)
    : uMode == 1 ? bloomLevel(uBloom2, 2.0 * uBloomFirst, at)
    : uMode == 2 ? bloomLevel(uBloom3, 4.0 * uBloomFirst, at)
    : uMode == 3 ? bloomLevel(uBloom4, 8.0 * uBloomFirst, at)
    : uMode == 4 ? withBloom(light, at)
    : uMode == 6 ? added
    : light;
  outColor = vec4(c, 1.0);
}