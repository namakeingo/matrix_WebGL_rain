#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
${M.Camera.GLSL}
${Fog.GLSL}
${Fog.MEDIUM_GLSL}
${head}
uniform int uLayer;
// (the layers of a draw, given at run time: a loop of a constant count is unrolled by Direct3D's
// compiler through ANGLE, each cell's code once a layer)
uniform int uLayers;
${layerOutputs}
vec4 cell(int i) {
  vec3 p = shadePlace(vec3(floor(gl_FragCoord.xy), float(uLayer + i)));
  return ${value};
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