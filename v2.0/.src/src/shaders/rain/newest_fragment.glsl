#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
${TEST_VIEWS}
uniform sampler2DArray uAtlas;
#ifdef TEST_VIEWS
// (the tests' view: each stamp as its id, 1 + its step % 255, its drop % 256 and its drop / 256,
// over 255; its ink 1)
uniform bool uIds;
flat in ivec2 vStamp;
#endif
in vec2 vUv;
flat in int vGlyph;
flat in vec3 vColor;
// the stamp, its whole cell opaque: its colour times its ink, and its ink
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outInk;
void main() {
  float ink = texture(uAtlas, vec3(vUv, float(vGlyph))).r;
#ifdef TEST_VIEWS
  if (uIds) {
    outColor = vec4(float(vStamp.x), float(vStamp.y % 256), float(vStamp.y / 256), 255.0) / 255.0;
    outInk = vec4(1.0);
    return;
  }
#endif
  outColor = vec4(vColor * ink, 1.0);
  outInk = vec4(ink, 0.0, 0.0, 1.0);
}