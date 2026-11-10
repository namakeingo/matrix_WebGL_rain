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
  vec4 direct = uSlice == 0 ? vec4(0.0, 0.0, 0.0, 1.0) : texelFetch(uSumDirect, c, 0);
  vec4 mirror = uSlice == 0 ? vec4(0.0, 0.0, 0.0, 1.0) : texelFetch(uSumMirror, c, 0);
  float lod = sliceLod(a, b);
  if (!directHeld(gl_FragCoord.xy, a)) direct = gather(direct, cEye.xyz, d, a, b, false, lod, uMarched);
  if (d.y < 0.0) {
    float start = max(a, cEye.y / -d.y);
    if (b > start) mirror = gather(mirror, cEye.xyz, d, start, b, true, lod, uMarched);
  }
  outDirect = direct;
  outMirror = mirror;
}