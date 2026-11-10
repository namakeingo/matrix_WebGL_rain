#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uGlyphs;
uniform sampler2D uReflected;
uniform bool uWithReflected;
uniform bool uRaw;
uniform bool uNearness;
uniform float uExposure;
// the HDR output: the light mapped by hdrCurve (1 = SDR white, up to uHeadroom), then by the sRGB curve
// as the SDR output is: a WebGPU canvas takes sRGB-encoded values, extended above 1 (an encoded 1.8247 is
// the light 4), divided by ${hdrRange} into the 10 bit picture (RGB10_A2: 0 to 1)
uniform bool uHdr;
uniform float uHeadroom;
// the scene's shift across (device pixels): the screen's pixel x shows the scene's x - uShift
uniform int uShift;
${bloomGlsl}
out vec4 outColor;
vec3 aces(vec3 x) {
  return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 hdrCurve(vec3 x) {
  vec3 t = max(x - 1.0, 0.0) / ${hdrSpan};
  return aces(x) + (uHeadroom - 1.0) * (t * t / (1.0 + t * t));
}
vec3 srgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy) - ivec2(uShift, 0);
  if (at.x < 0 || at.x >= textureSize(uScene, 0).x) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 glyphs = texelFetch(uGlyphs, at, 0).rgb;
  if (uNearness) {
    outColor = vec4(clamp(max(texelFetch(uScene, at, 0).rgb, glyphs), 0.0, 1.0), 1.0);
    return;
  }
  vec3 light = texelFetch(uScene, at, 0).rgb + glyphs;
  // (the emitters' light, their own and reflected, with what the bloom moves: none at Bloom 0)
  if (uBloom > 0.0) light += bloomMoved(uWithReflected ? glyphs + texelFetch(uReflected, at, 0).rgb : glyphs, gl_FragCoord.xy - vec2(float(uShift), 0.0));
  outColor = vec4(uRaw ? clamp(light, 0.0, 1.0) : uHdr ? srgb(hdrCurve(light * uExposure)) / ${hdrRange} : srgb(aces(light * uExposure)), 1.0);
}