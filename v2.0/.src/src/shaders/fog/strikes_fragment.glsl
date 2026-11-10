#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
${TEST_VIEWS}
${M.Camera.GLSL}
${Fog.GLSL}
${Fog.MEDIUM_GLSL}
${Fog.SHADE_GLSL}
${Fog.TEST_GLSL}
${glsl.lightning}
${glsl.emitter}
${glsl.scatter}
${SLICE_GLSL}
uniform sampler2D uSumDirect;
uniform sampler2D uSumMirror;
uniform int uSlot;
layout(location = 0) out vec4 outDirect;
layout(location = 1) out vec4 outMirror;
// the light of a stretch a to b of the ray d (mirrored: in the water), let through to its start t0:
// scattered by the clouds (sigma, their albedo) and the air (AIR, white)
vec3 stretch(float t0, float a, float b, vec3 d, bool mirrored, float lod) {
  vec3 p = cEye.xyz + 0.5 * (a + b) * d;
  if (mirrored) p.y = -p.y;
  vec3 view = mirrored ? vec3(d.x, -d.y, d.z) : d;
  float sigma = density(p, lod);
  float extinction = sigma + AIR;
  vec3 scatter = (sigma * albedoAt(p, lod) + AIR) / extinction;
  return t0 * STRIKE_SCALE * strikeUnit(uSlot, p, view, lod, uMarched) * scatter * (1.0 - exp(-extinction * (b - a)));
}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec3 d = columnRay(gl_FragCoord.xy);
  float a = sliceAt(float(uSlice) / SLICES);
  float b = sliceAt(float(uSlice + 1) / SLICES);
  vec3 direct = uSlice == 0 ? vec3(0.0) : texelFetch(uSumDirect, c, 0).rgb;
  vec3 mirror = uSlice == 0 ? vec3(0.0) : texelFetch(uSumMirror, c, 0).rgb;
  float lod = sliceLod(a, b);
  // (the direct ray, then the mirrored one from where it meets still water: one stretch in a loop
  // of a count given at run time, so the strikes' light is in the program once)
  int rays = flashRays();
  for (int k = 0; k < rays; k++) {
    if (k >= 2) break;
    bool mirrored = k == 1;
    if (!mirrored && directHeld(gl_FragCoord.xy, a)) continue;
    float from = a;
    if (mirrored) {
      if (d.y >= 0.0) break;
      from = max(a, cEye.y / -d.y);
      if (b <= from) break;
    }
    float t0 = uSlice == 0 ? 1.0 : mirrored ? texelFetch(uFogMirror, ivec3(c, uSlice - 1), 0).a : texelFetch(uFogDirect, ivec3(c, uSlice - 1), 0).a;
    vec3 light = stretch(t0, from, b, d, mirrored, lod);
    if (mirrored) mirror += light;
    else direct += light;
  }
  outDirect = vec4(direct, 1.0);
  outMirror = vec4(mirror, 1.0);
}