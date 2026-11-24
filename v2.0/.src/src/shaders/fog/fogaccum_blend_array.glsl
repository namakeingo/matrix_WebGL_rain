#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2DArray;
// the base mist's held slice uSlice moved towards the fresh slice by uAlpha (the temporal accumulation: engine/basemist.ts), the fresh slice read from ONE texture array of the job's whole output (models/basemistjob.ts: the layer
// 2 k the direct picture and 2 k + 1 the mirrored one of slice k), bilinearly at the place its samples were taken (the column's middle moved by the frame's jitter): fogaccum_blend.glsl with the pictures in layers
uniform sampler3D uHeld;
uniform sampler3D uHeldMirror;
uniform sampler2DArray uFreshArray;
uniform int uSlice;
uniform float uAlpha;
// the direct picture's layer of the fresh slice (the mirrored one is the next)
uniform int uLayer;
// xy: the reduced columns per column of the full volume; zw: the samples' offset in reduced columns
uniform vec4 uMap;
// xy: the fresh pictures' size; zw: the reduced columns the slice holds
uniform vec4 uSize;
layout(location = 0) out vec4 outDirect;
layout(location = 1) out vec4 outMirror;
void main() {
  vec2 r = clamp(gl_FragCoord.xy * uMap.xy - uMap.zw, vec2(0.5), uSize.zw - 0.5) / uSize.xy;
  ivec3 c = ivec3(ivec2(gl_FragCoord.xy), uSlice);
  outDirect = mix(texelFetch(uHeld, c, 0), textureLod(uFreshArray, vec3(r, float(uLayer)), 0.0), uAlpha);
  outMirror = mix(texelFetch(uHeldMirror, c, 0), textureLod(uFreshArray, vec3(r, float(uLayer + 1)), 0.0), uAlpha);
}
