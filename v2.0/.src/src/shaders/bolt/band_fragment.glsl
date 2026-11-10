#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2DArray;
uniform float uMirror;
uniform bool uCovers;
${M.Camera.GLSL}
${glsl.waves}
${PROFILE_GLSL}
in vec3 vWorld;
in float vFog;
flat in vec3 vA;
flat in vec3 vB;
flat in vec3 vBefore;
flat in vec3 vAfter;
flat in vec2 vNeighbours;
flat in float vSize;
flat in float vPixels;
flat in float vLight;
flat in float vKind;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outSecond;
${nearOutput}
const float COVER = ${COVER.toFixed(4)};
const float COVER_LIGHT = ${COVER_LIGHT.toFixed(4)};
const float NEAR_SCALE = ${NEAR_SCALE.toFixed(1)};
const float BAND_PER_SIZE = ${BAND_PER_SIZE.toFixed(6)};
const float SHAPE_MOST = ${SHAPE_MOST.toFixed(4)};
// the distance between the ray from the eye along v (a unit way) and the segment p to q, and the
// part of the way along the segment of its nearest point (not clamped). Past an end, the distance
// to that end worked out from the end alone: two pieces meeting there give the same number to the
// bit, so which owns a pixel nearest their joint is decided by their order, never by rounding
vec2 raySegment(vec3 v, vec3 p, vec3 q) {
  vec3 w = p - cEye.xyz;
  w -= dot(w, v) * v;
  vec3 e = q - cEye.xyz;
  e -= dot(e, v) * v;
  vec3 d = q - p;
  d -= dot(d, v) * v;
  float dd = dot(d, d);
  float t = dd > 0.0 ? -dot(w, d) / dd : 0.0;
  float distance = t <= 0.0 ? length(w) : t >= 1.0 ? length(e) : length(w + t * d);
  return vec2(distance, t);
}
// the bell at r pixels from the line (its middle 1), and its sum across both sides (pixels)
float bellAt(float r, vec3 bell) {
  float g = bellG(r, bell);
  return exp(-g) * (1.0 - smoothstep(BELL_END - 2.0, BELL_END, g));
}
void main() {
  vec3 ray = rayOf(gl_FragCoord.xy);
  vec2 near = raySegment(ray, vA, vB);
#if ${mask ? 1 : 0}
  // (one owner a line: the piece nearest the pixel's ray among it and its neighbours, a tie with
  // the piece before going to that one, with the piece after to this one: each pixel of a line
  // counted once, so its joints add nothing; other lines' owners add)
  if (vNeighbours.x > 0.5 && raySegment(ray, vBefore, vA).x <= near.x) discard;
  if (vNeighbours.y > 0.5 && raySegment(ray, vB, vAfter).x < near.x) discard;
#endif
  // (hidden below the water's surface: the piece's point nearest the pixel's ray, not the band's
  // corner, which lies off the line by up to its reach)
  vec3 at = mix(vA, vB, clamp(near.y, 0.0, 1.0));
  float height = abs(at.y);
  if (vLight <= 0.0 || (height < highestWave() && height < waveHeight(vec2(at.x, -at.z)))) discard;
  float r = near.x / vSize;
  float seen = vLight * vFog;
  vec3 bell = bellOf(vPixels);
  float shape = bellAt(r * vPixels, bell);
  // (its light a metre BAND_PER_SIZE x its size x its radiance)
  float light = seen * shape * BAND_PER_SIZE * vPixels / bellSum(bell);
  if (light <= 0.0) discard;
  bool mirrored = uMirror < 0.0;
#if ${mask ? 1 : 0}
  // (the combined shape, its owners' as one: 1 - the product of (1 - each), summed as logarithms;
  // their light, their nearness and their shapes summed by the same weights, each over the sum
  // of the shapes the one they carry; the cover added, its readers taking at most COVER)
  float lost = -log(1.0 - min(shape, SHAPE_MOST));
  float cover = uCovers ? COVER * shape * min(1.0, vLight / COVER_LIGHT) : 0.0;
  float n = min(1.0, NEAR_SCALE / length(at - cEye.xyz));
  outColor = mirrored ? vec4(0.0, light, 0.0, lost) : vec4(light, 0.0, lost, 0.0);
  outSecond = mirrored ? vec4(0.0, 0.0, cover, 0.0) : vec4(cover, 0.0, 0.0, 0.0);
  outNear = mirrored ? vec4(0.0, shape * n, 0.0, shape) : vec4(shape * n, 0.0, shape, 0.0);
#else
  outColor = vec4(0.0);
  outSecond = vec4(r <= 0.5 ? length(vWorld - cEye.xyz) : FAR_DISTANCE, 0.0, 0.0, 1.0);
#endif
}