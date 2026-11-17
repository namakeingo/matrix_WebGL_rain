#version 300 es
precision highp float;
precision highp int;
// the HDR picture (RGB10_A2, W x H) packed for an ImageBitmap: the canvas is W + ceil(W / 4) wide; its columns 0 to W - 1 are the
// high 8 bits of each pixel's 10 bit levels, column W + k the low 2 bits of the pixels 4k to 4k + 3 (see HdrPack)
uniform sampler2D uPicture;
uniform int uWidth;
out vec4 outColor;
${packGlsl}
// the levels of picture pixel x of row y; 0 past the row's end (the last low-bits byte's unused fields)
ivec3 levelAt(int x, int y) {
  if (x >= uWidth) {
    return ivec3(0);
  }
  return ivec3(floor(texelFetch(uPicture, ivec2(x, y), 0).rgb * 1023.0 + 0.5));
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (p.x < uWidth) {
    outColor = packHdr(levelAt(p.x, p.y));
  } else {
    int x = 4 * (p.x - uWidth);
    outColor = packHdrLow(levelAt(x, p.y), levelAt(x + 1, p.y), levelAt(x + 2, p.y), levelAt(x + 3, p.y));
  }
}
