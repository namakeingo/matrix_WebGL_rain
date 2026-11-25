#version 300 es
precision highp float;
precision highp int;
// The far water rows drawn at half resolution (effects/water.ts farHalf): each full-resolution pixel of the band is the bilinear blend of the four half-resolution pixels around it (the colour
// and the reflected light, read texel by texel: no filtering of the targets is needed), and the crest's distance (R32F, never blended: a distance is not an average) is the nearest one's.
// A half-resolution pixel (i, j) stands for the 2 x 2 block around the full-resolution place (2 i + 1, origin.y + 2 j + 1), so a full-resolution pixel centre p (from the band's first row)
// sits at (p - 1) / 2 in half-resolution texel indices.
uniform sampler2D uHalfColor;
uniform sampler2D uHalfReflected;
uniform sampler2D uHalfCrest;
// the half-resolution pixels the band filled (across, down) and the band's first row in the picture
uniform ivec2 uHalfSize;
uniform float uOriginY;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outReflected;
layout(location = 2) out float outCrest;
void main() {
  vec2 p = vec2(gl_FragCoord.x, gl_FragCoord.y - uOriginY);
  vec2 h = p * 0.5 - 0.5;
  vec2 f = h - floor(h);
  ivec2 last = uHalfSize - 1;
  ivec2 a = clamp(ivec2(floor(h)), ivec2(0), last);
  ivec2 b = clamp(ivec2(floor(h)) + 1, ivec2(0), last);
  outColor = mix(mix(texelFetch(uHalfColor, ivec2(a.x, a.y), 0), texelFetch(uHalfColor, ivec2(b.x, a.y), 0), f.x), mix(texelFetch(uHalfColor, ivec2(a.x, b.y), 0), texelFetch(uHalfColor, ivec2(b.x, b.y), 0), f.x), f.y);
  outReflected = mix(mix(texelFetch(uHalfReflected, ivec2(a.x, a.y), 0), texelFetch(uHalfReflected, ivec2(b.x, a.y), 0), f.x), mix(texelFetch(uHalfReflected, ivec2(a.x, b.y), 0), texelFetch(uHalfReflected, ivec2(b.x, b.y), 0), f.x), f.y);
  outCrest = texelFetch(uHalfCrest, clamp(ivec2(p * 0.5), ivec2(0), last), 0).r;
}
