#version 300 es
precision highp float;
precision highp int;
${OUTPUT}
${M.Camera.GLSL}
// the stamps (screen pixels): their colour and their ink; the scene's shift across (device
// pixels: the scene's x shows at the screen's x + uShift)
uniform sampler2D uStampColor;
uniform sampler2D uStampInk;
uniform int uShift;
#ifdef SCENE
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outReflected;
#else
// High contrast text off with the colour wave: the hue of the rain in the pixel's column (a fall
// beginning now at its bearing), its luminosity kept (the W3C 'color' blend)
uniform bool uRecolor;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform bool uCustom;
uniform bool uWave;
uniform float uWaveWidth;
uniform float uWaveNow;
uniform float uWaveScreen;
${COLOR_GLSL}
float lum(vec3 c) {
  return dot(c, vec3(0.3, 0.59, 0.11));
}
vec3 clipColor(vec3 c) {
  float l = lum(c);
  float n = min(min(c.r, c.g), c.b);
  float x = max(max(c.r, c.g), c.b);
  if (n < 0.0) c = l + (c - l) * l / (l - n);
  if (x > 1.0) c = l + (c - l) * (1.0 - l) / (x - l);
  return c;
}
vec3 setLum(vec3 c, float l) {
  return clipColor(c + (l - lum(c)));
}
layout(location = 0) out vec4 outColor;
#endif
// the stamps over the scene: its light times (1 - ink), plus their colour (blended: SCENE the
// scene's picture and its second attachment, else the characters' picture)
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy) + ivec2(uShift, 0);
  float ink = 0.0;
  vec3 color = vec3(0.0);
  if (at.x >= 0 && at.x < textureSize(uStampInk, 0).x) {
    ink = texelFetch(uStampInk, at, 0).r;
    color = texelFetch(uStampColor, at, 0).rgb;
  }
#ifdef SCENE
  outColor = vec4(0.0, 0.0, 0.0, ink);
  outReflected = vec4(0.0, 0.0, 0.0, ink);
#else
  if (uRecolor) {
    vec3 ray = rayOf(gl_FragCoord.xy);
    color = setLum(fallColor(ray.x / -ray.z / uWaveScreen + 0.5, uWaveNow), lum(color));
  }
  outColor = vec4(color, ink);
#endif
}