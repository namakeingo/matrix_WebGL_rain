#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
// the reduced sums' start for a run of slices: the held volume's slice uSlice read at the places of the reduced columns (the temporal accumulation's fresh chain: engine/fogaccum.ts)
uniform sampler3D uHeld;
uniform sampler3D uHeldMirror;
uniform int uSlice;
// xy: the columns of the full volume that one reduced column covers; zw: the sample's offset in reduced columns
uniform vec4 uMap;
// xy: the full volume's columns; z: the layers of its texture (the front's slices and the base mist's after them: the slice is read at (slice + 0.5) / layers)
uniform vec3 uVolume;
layout(location = 0) out vec4 outDirect;
layout(location = 1) out vec4 outMirror;
void main() {
  vec2 at = (gl_FragCoord.xy + uMap.zw) * uMap.xy / uVolume.xy;
  vec3 k = vec3(at, (float(uSlice) + 0.5) / uVolume.z);
  outDirect = textureLod(uHeld, k, 0.0);
  outMirror = textureLod(uHeldMirror, k, 0.0);
}
