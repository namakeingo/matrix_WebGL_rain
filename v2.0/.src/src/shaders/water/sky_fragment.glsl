#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
${M.Camera.GLSL}
${glsl.fog}
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outReflected;
layout(location = 2) out float outCrest;
const float CREST_FAR = ${M.CrestHide.FAR.toFixed(1)};
// The water program (fragment.glsl) for the pixels above the horizon, which the water's parts never touch: the sky and the fog over it, read at
// the pixel to FOG_FAR, and the strikes' share of the fog's light as the second output; the crest picture (the third output) holds CREST_FAR: no crest in the sky. Every line below is a line of fragment.glsl (the
// water's source with the water's parts taken away), so the pixel is the same; only the water's declarations and branches are not in this
// program. Drawn only for bands of rows with no water in them (models/quality/waterbands.ts), in the scene view.
const bool unseen = false;
void main() {
  outReflected = vec4(0.0, 0.0, 0.0, 1.0);
  outCrest = CREST_FAR;
  vec3 strike = vec3(0.0);
  vec4 fog = vec4(0.0, 0.0, 0.0, 1.0);
  vec3 d = rayOf(gl_FragCoord.xy);
  vec3 color = unseen ? vec3(0.0) : atmosSeen(d);
  vec3 reflected = vec3(0.0);
  float end = FOG_FAR;
  vec2 fogPixel = gl_FragCoord.xy;
  fog = fogAt(fogPixel, end, false, strike);
  outColor = vec4(color * fog.a + fog.rgb, 1.0);
  outReflected = vec4(reflected * fog.a + strike, 1.0);
}
