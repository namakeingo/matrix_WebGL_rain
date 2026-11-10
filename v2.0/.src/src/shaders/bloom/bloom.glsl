
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform sampler2D uBloom3;
uniform sampler2D uBloom4;
uniform float uBloom;
uniform float uBloomFirst;
vec3 bloomLevel(sampler2D level, float scale, vec2 at) {
  return textureLod(level, at / (scale * vec2(textureSize(level, 0))), 0.0).rgb;
}
vec3 bloomSpread(vec2 at) {
  float s = uBloomFirst;
  return 0.25 * (bloomLevel(uBloom1, s, at) + bloomLevel(uBloom2, 2.0 * s, at) + bloomLevel(uBloom3, 4.0 * s, at) + bloomLevel(uBloom4, 8.0 * s, at));
}
vec3 bloomMoved(vec3 source, vec2 at) {
  return uBloom > 0.0 ? uBloom * (bloomSpread(at) - source) : vec3(0.0);
}
vec3 withBloom(vec3 light, vec2 at) {
  return light + bloomMoved(light, at);
}