#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
${TEST_VIEWS}
${M.Camera.GLSL}
${Fog.GLSL}
${Fog.MEDIUM_GLSL}
${Fog.SHADE_GLSL}
${Fog.TEST_GLSL}
${Fog.GATHER_GLSL}
// the volume's slice as volume_fragment.glsl makes it (the sums so far from the slice before, this slice's far end on), at a reduced number of columns and with the sample's place moved
// by the frame's jitter (the temporal accumulation's fresh slice: engine/fogaccum.ts)
uniform int uSlice;
// 1: the column may hold this slice when nothing reads it (directHeld); 0: every column gathers it
uniform float uCull;
// 1: a column also holds a slice where its own ray's transmittance bound is under TAIL_T; 0: only the water's cut holds
uniform float uTail;
// xy: the columns of the full volume that one column of this one covers, minus 1 (0: the full volume's own columns); zw: the sample's offset in this volume's columns (0: the column's middle)
uniform vec4 uAccum;
// the sample's place in the slice along the ray, 0 to 1 (0.5: the middle, as the full volume's)
uniform float uAccumZ;
uniform sampler2D uSumDirect;
uniform sampler2D uSumMirror;
const float CULL_BELOW = ${CULL_BELOW};
const float CULL_RELATIVE = ${CULL_RELATIVE};
const float TAIL_T = ${TAIL_T};
float tailBound(float dy, float a) {
  return exp(-AIR_EXTINCTION * a);
}
float sliceLod(float a, float b) {
  return lodOf(max(0.5 * (a + b) * fVolume.z / cEye.w, b - a));
}
float underWater(vec2 fc) {
  float dy = columnRay(fc).y;
  return dy < -1e-6 ? (cEye.y + CULL_BELOW) / -dy : 1e30;
}
// directHeld (slice.glsl) with the neighbours a reduced column's width apart (the columns of the full volume that this column stands for are read between its neighbours)
bool directHeld(vec2 fc, float a, vec2 w) {
  if (uCull < 0.5) return false;
  if (uTail > 0.5 && tailBound(columnRay(fc).y, a) < TAIL_T) return true;
  float far = underWater(fc);
  if (far >= 1e29) return false;
  // (the eight neighbours in one loop, its count a value at run time (uCull is 1 here: the function returned above when it is 0): the centre, offset (0, 0), is the loop's fifth, a max with itself)
  int ring = int(8.0 * uCull + 1.5);
  for (int i = 0; i < ring; i++) {
    if (i >= 9) break;
    far = max(far, underWater(fc + w * vec2(float(i % 3) - 1.0, float(i / 3) - 1.0)));
  }
  return a > far * (1.0 + CULL_RELATIVE);
}
// gather (gather.glsl) with the medium taken at t of the slice (0 to 1) along the ray instead of its middle
vec4 gatherAt(vec4 acc, vec3 o, vec3 d, float a, float b, float t, bool mirrored, float lod, bool marched) {
  float dt = b - a;
  vec3 p = o + (a + t * dt) * d;
  if (mirrored) p.y = -p.y;
  vec3 view = mirrored ? vec3(d.x, -d.y, d.z) : d;
  float sigma = densityFar(p, lod, uFar > 0.5 && !marched);
  float extinction = sigma + AIR_EXTINCTION;
  vec3 source = sigma > 1e-6 ? fogLight(p, view, lod, marched, sigma) : vec3(0.0);
  float pass = exp(-extinction * dt);
  acc.rgb += exp(-acc.a) * source * (1.0 - pass) / extinction;
  acc.a += extinction * dt;
  return acc;
}
layout(location = 0) out vec4 outDirect;
layout(location = 1) out vec4 outMirror;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 w = 1.0 + uAccum.xy;
  vec2 fc = (gl_FragCoord.xy + uAccum.zw) * w;
  vec3 d = columnRay(fc);
  float a = sliceAt(float(uSlice) / SLICES);
  float b = sliceAt(float(uSlice + 1) / SLICES);
  vec4 direct = uSlice == 0 ? vec4(0.0) : texelFetch(uSumDirect, c, 0);
  vec4 mirror = uSlice == 0 ? vec4(0.0) : texelFetch(uSumMirror, c, 0);
  float lod = sliceLod(a, b);
  // (the direct ray, then the mirrored one from where it meets still water: one gatherAt site in a loop of a count given at run time, so its code is in the program once)
  int rays = d.y < 0.0 ? 2 : 1;
  for (int k = 0; k < rays; k++) {
    if (k >= 2) break;
    bool mirrored = k == 1;
    float from = a;
    if (mirrored) {
      from = max(a, cEye.y / -d.y);
      if (b <= from) break;
    } else if (directHeld(fc, a, w)) {
      continue;
    }
    vec4 acc = gatherAt(mirrored ? mirror : direct, cEye.xyz, d, from, b, uAccumZ, mirrored, lod, uMarched);
    if (mirrored) mirror = acc;
    else direct = acc;
  }
  outDirect = direct;
  outMirror = mirror;
}
