#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
${M.Camera.GLSL}
${Fog.GLSL}
${Fog.MEDIUM_GLSL}
// the front shade grid's accumulation (engine/shadeaccum.ts): the sky's and the moon's light at the nodes of the reduced grid, each node at the place of the full grid the frame's jitter moves it to
// (M.ShadeAccum.nodeAt: clamp((j + jitter) n / r - 1/2, 0, n - 1) on each axis), baked as the exact bake bakes a cell (marched, 4 places over 8 m). uLayer: the first reduced layer of the draw;
// uLayers: the layers of the draw (a count given at run time: a loop of a constant count is unrolled by Direct3D's compiler through ANGLE)
uniform int uLayer;
uniform int uLayers;
uniform vec3 uJit;
const vec3 FRESH_CELLS = vec3(${FRESH_X}, ${FRESH_Y}, ${FRESH_Z});
${layerOutputs}
vec4 cell(int i) {
  vec3 node = clamp((vec3(floor(gl_FragCoord.xy), float(uLayer + i)) + uJit) * SHADE_CELLS / FRESH_CELLS - 0.5, vec3(0.0), SHADE_CELLS - 1.0);
  vec3 p = shadePlace(node);
  return vec4(skyShadeMarched(p, shadeLod(p)), 0.0, 1.0);
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
