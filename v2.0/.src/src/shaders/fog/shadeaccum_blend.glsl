#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
// the front shade grid's accumulation (engine/shadeaccum.ts): the held grid's layers uLayer.. moved towards the fresh reduced grid by uAlpha, into a scratch grid (a layer is never read while it is written:
// the store copies them into the held grid). The fresh grid is read trilinearly at the reduced lattice coordinate of the cell: (i + 1/2) r / n - jitter, clamped to the lattice (M.ShadeAccumGpu.readCoord)
uniform sampler3D uHeld;
uniform sampler3D uFresh;
uniform int uLayer;
uniform int uLayers;
uniform float uAlpha;
uniform vec3 uJit;
const vec3 FULL_CELLS = vec3(${FULL_X}, ${FULL_Y}, ${FULL_Z});
const vec3 FRESH_CELLS = vec3(${FRESH_X}, ${FRESH_Y}, ${FRESH_Z});
${layerOutputs}
vec4 cell(int i) {
  ivec3 c = ivec3(ivec2(gl_FragCoord.xy), uLayer + i);
  vec3 s = clamp((vec3(c) + 0.5) * FRESH_CELLS / FULL_CELLS - uJit, vec3(0.0), FRESH_CELLS - 1.0);
  vec2 fresh = textureLod(uFresh, (s + 0.5) / FRESH_CELLS, 0.0).rg;
  return vec4(mix(texelFetch(uHeld, c, 0).rg, fresh, uAlpha), 0.0, 1.0);
}
void main() {
  vec4 cells[${n}];
  for (int i = 0; i < ${n}; i++) cells[i] = vec4(1.0);
  for (int i = 0; i < uLayers; i++) {
    if (i >= ${n}) break;
    cells[i] = cell(i);
  }
${layerWrites}
}
