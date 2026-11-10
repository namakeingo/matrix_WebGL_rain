#version 300 es
precision highp float;
precision highp int;
// the HDR picture (RGB10_A2, W x H) packed for an ImageBitmap: the canvas is 2 W wide, its left half the high 8 bits
// of each pixel's 10 bit levels, its right half the low 2 bits (see HdrPack)
uniform sampler2D uPicture;
uniform int uWidth;
out vec4 outColor;
${packGlsl}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec3 q = ivec3(floor(texelFetch(uPicture, ivec2(p.x % uWidth, p.y), 0).rgb * 1023.0 + 0.5));
  outColor = packHdr(q, p.x >= uWidth);
}
