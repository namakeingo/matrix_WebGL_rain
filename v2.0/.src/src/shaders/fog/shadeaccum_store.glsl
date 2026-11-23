#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
// the front shade grid's accumulation (engine/shadeaccum.ts): the blended layers uLayer.. copied from the scratch grid into the held grid's layers (the framebuffers of the front layers only)
uniform sampler3D uBlended;
uniform int uLayer;
${layerOutputs}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
${stores}
}
