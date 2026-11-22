#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
// the held volume's slice uSlice moved towards the fresh slice by uAlpha (the temporal accumulation's exponential moving average: engine/fogaccum.ts); the fresh slice is the reduced one,
// read bilinearly at the place its samples were taken (the column's middle moved by the frame's jitter)
uniform sampler3D uHeld;
uniform sampler3D uHeldMirror;
uniform sampler2D uFresh;
uniform sampler2D uFreshMirror;
uniform int uSlice;
uniform float uAlpha;
// xy: the reduced columns per column of the full volume; zw: the samples' offset in reduced columns
uniform vec4 uMap;
// xy: the fresh pictures' size; zw: the reduced columns the slice holds
uniform vec4 uSize;
layout(location = 0) out vec4 outDirect;
layout(location = 1) out vec4 outMirror;
void main() {
  vec2 r = clamp(gl_FragCoord.xy * uMap.xy - uMap.zw, vec2(0.5), uSize.zw - 0.5) / uSize.xy;
  ivec3 c = ivec3(ivec2(gl_FragCoord.xy), uSlice);
  outDirect = mix(texelFetch(uHeld, c, 0), textureLod(uFresh, r, 0.0), uAlpha);
  outMirror = mix(texelFetch(uHeldMirror, c, 0), textureLod(uFreshMirror, r, 0.0), uAlpha);
}
