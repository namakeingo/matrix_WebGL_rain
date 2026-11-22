#version 300 es
precision highp float;
precision highp int;
// the blended slice written into the held volume's layer (the temporal accumulation: engine/fogaccum.ts)
uniform sampler2D uBlended;
uniform sampler2D uBlendedMirror;
layout(location = 0) out vec4 outDirect;
layout(location = 1) out vec4 outMirror;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  outDirect = texelFetch(uBlended, c, 0);
  outMirror = texelFetch(uBlendedMirror, c, 0);
}
