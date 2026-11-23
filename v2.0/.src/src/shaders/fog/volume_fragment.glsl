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
${Fog.GATHER_GLSL}
${SLICE_GLSL}
uniform sampler2D uSumDirect;
uniform sampler2D uSumMirror;
layout(location = 0) out vec4 outDirect;
layout(location = 1) out vec4 outMirror;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec3 d = columnRay(gl_FragCoord.xy);
  float a = sliceAt(float(uSlice) / SLICES);
  float b = sliceAt(float(uSlice + 1) / SLICES);
  // (rgb the light so far, a the optical depth so far)
  vec4 direct = uSlice == 0 ? vec4(0.0) : texelFetch(uSumDirect, c, 0);
  vec4 mirror = uSlice == 0 ? vec4(0.0) : texelFetch(uSumMirror, c, 0);
  float lod = sliceLod(a, b);
  // (the direct ray, then the mirrored one from where it meets still water: one gather site in a loop of a count given at run time, so its code is in the program once)
  int rays = d.y < 0.0 ? 2 : 1;
  for (int k = 0; k < rays; k++) {
    if (k >= 2) break;
    bool mirrored = k == 1;
    float from = a;
    if (mirrored) {
      from = max(a, cEye.y / -d.y);
      if (b <= from) break;
    } else if (directHeld(gl_FragCoord.xy, a)) {
      continue;
    }
    vec4 acc = gather(mirrored ? mirror : direct, cEye.xyz, d, from, b, mirrored, lod, uMarched);
    if (mirrored) mirror = acc;
    else direct = acc;
  }
  outDirect = direct;
  outMirror = mirror;
}