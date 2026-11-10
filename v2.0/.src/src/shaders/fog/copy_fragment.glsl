#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
uniform sampler3D uFrom;
uniform sampler3D uFromMirror;
uniform int uSlice;
uniform int uOffset;
layout(location = 0) out vec4 outDirect;
layout(location = 1) out vec4 outMirror;
void main() {
  ivec3 c = ivec3(ivec2(gl_FragCoord.xy), uOffset + uSlice);
  outDirect = texelFetch(uFrom, c, 0);
  outMirror = texelFetch(uFromMirror, c, 0);
}