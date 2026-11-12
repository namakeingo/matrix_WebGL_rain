#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
${M.Camera.GLSL}
${glsl.fog}
${M.GlyphAtlas.VERTEX_GLSL}
#define WAVE_LIFT_AT
${WAVE_LIFT_GLSL}
${FOOT_GLSL}
${LIGHT_GLSL}
${PROFILE_GLSL}
uniform highp sampler2D uSegments;
uniform int uFirst;
// whether the pieces are the listed ones (aDrop: the piece's index in the data texture), else uFirst + gl_InstanceID
uniform bool uListed;
uniform float uMirror;
uniform float uBand;
// the glow's cut by level of detail: eps (an HDR light) for each level 0 to 40 (0: the full cut)
uniform float uTailEps[41];
// the brightest peak a piece sharing a pixel can have (QualityBolt.peakBound of the frame's brightest light): a cut piece's shape weighs against it
uniform float uOthers;
// 1 where a piece whose light with uOthers is under eps draws nothing (the mask's pass; the distance output keeps every piece)
uniform float uDrop;
in vec2 aCorner;
in uint aDrop;
out vec3 vWorld;
out float vFog;
flat out vec3 vA;
flat out vec3 vB;
flat out vec3 vBefore;
flat out vec3 vAfter;
flat out vec2 vNeighbours;
flat out float vSize;
flat out float vPixels;
flat out float vLight;
flat out float vKind;
const int ACROSS = ${SEGMENTS_ACROSS};
const int TEXELS = ${SEGMENT_TEXELS};
const float WIDEN_PX = ${WIDEN_PX.toFixed(2)};
const float BAND_PER_SIZE = ${BAND_PER_SIZE.toFixed(6)};
const float FOOTPRINT_FULL_PX = ${FOOTPRINT_FULL_PX.toFixed(1)};
const int BOLT_LEVELS = ${QUALITY_LEVELS};
const float TAIL_END_FLOOR = ${TAIL_END_FLOOR.toFixed(1)};
vec4 texel(int i, int k) {
  return texelFetch(uSegments, ivec2((i % ACROSS) * TEXELS + k, i / ACROSS), 0);
}
void hidePiece() {
  vWorld = vec3(0.0);
  vFog = 0.0;
  vA = vB = vBefore = vAfter = vec3(0.0);
  vNeighbours = vec2(0.0);
  vSize = vPixels = vLight = vKind = 0.0;
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
void main() {
  int i = uListed ? int(aDrop) : uFirst + gl_InstanceID;
  vec4 a = texel(i, 0);
  vec4 b = texel(i, 1);
  vec4 prev = texel(i, 2);
  vec4 next = texel(i, 3);
  vec4 growth = texel(i, 4);
  // (the foot on the water rests on the live wave at its place; no other point of the lines moves)
  float foot = footLift(a.xyz, b.xyz, prev.xyz, next.xyz);
  a.y = a.y == 0.0 ? foot : a.y;
  b.y = b.y == 0.0 ? foot : b.y;
  prev.y = prev.y == 0.0 ? foot : prev.y;
  next.y = next.y == 0.0 ? foot : next.y;
  // (cut at the slot's growth: from its start to as far as it has grown, the piece after from
  // this one's end to its own grown end; nothing before its start is reached or once hidden)
  float grown = slotOf(uGrown, uSlot);
  float part = grownPart(grown, growth.x, growth.y);
  bool shown = grown >= growth.x && grown < growth.w && part > 0.0;
  // (the piece after there once this one is whole and that one has begun: the main channel's
  // pieces all at once, at the meeting)
  bool after = part >= 1.0 && grownPart(grown, growth.y, growth.z) > 0.0;
  vec3 m = vec3(1.0, uMirror, 1.0);
  vec3 pa = a.xyz * m;
  vec3 pb = mix(a.xyz, b.xyz, part) * m;
  vec3 afterEnd = mix(b.xyz, next.xyz, grownPart(grown, growth.y, growth.z)) * m;
  vec3 middle = (pa + pb) * 0.5;
  float depth = dot(middle - cEye.xyz, cForward.xyz);
  vec3 d = pb - pa;
  float l = length(d);
  float light = shown ? b.w * uBand * itemLight(prev.w, uSlot) : 0.0;
  if (light <= 0.0 || l <= 0.0 || depth <= cForward.w) {
    hidePiece();
    return;
  }
  vKind = prev.w;
  d /= l;
  // (under WIDEN_PX wide: WIDEN_PX wide, its light spread over it)
  float pixels = a.w * cEye.w / depth;
  float widen = max(1.0, WIDEN_PX / max(pixels, 1e-3));
  float size = a.w * widen;
  vec3 across = cross(d, cEye.xyz - middle);
  vec3 side = dot(across, across) > 1e-12 ? normalize(across) : cRight.xyz;
  // (the glow cut where it falls under eps: the level from the piece's extent on the screen, its peak the most light a pixel can
  // get from it, the fog and the shape at most 1)
  float drawn = pixels * widen;
  float extent = max(l * cEye.w / depth, pixels);
  int level = clamp(int(ceil(float(BOLT_LEVELS) * clamp(extent / FOOTPRINT_FULL_PX, 1.0 / float(BOLT_LEVELS), 1.0))), 1, BOLT_LEVELS);
  float eps = uTailEps[level];
  float cutEnd = BELL_END;
  if (eps > 0.0) {
    // (its peak and the brightest one sharing its pixels: the pixel's value is the lines' light over their shapes, so the shape removed counts
    // against the brightest light there)
    float total = light / widen * BAND_PER_SIZE * drawn / bellSum(bellOf(drawn)) + uOthers;
    if (uDrop > 0.5 && total < eps) {
      hidePiece();
      return;
    }
    cutEnd = total > eps ? clamp(log(total / eps), TAIL_END_FLOOR, BELL_END) : TAIL_END_FLOOR;
  }
  // (as far as its profile reaches, and a pixel more)
  float reach = size * profileReachTo(drawn, cutEnd) / drawn;
  // (past each end across the view: a disc of the reach round the end on the screen, however the
  // piece is turned in depth)
  vec3 p = aCorner.x < 0.5 ? pa : pb;
  vec3 past = normalize(cross(normalize(cEye.xyz - p), side));
  past = dot(past, d) * (aCorner.x < 0.5 ? -1.0 : 1.0) < 0.0 ? -past : past;
  vec3 end = p + past * reach;
  vec3 world = end + side * reach * (aCorner.y * 2.0 - 1.0);
  vec4 clip = cViewProj * vec4(world, 1.0);
  vWorld = world;
  vA = pa;
  vB = pb;
  // (the piece before, from its start to this one's, and after, from this one's end to its end:
  // none where they are this piece's own ends)
  vBefore = prev.xyz * m;
  vAfter = afterEnd;
  vNeighbours = vec2(any(notEqual(prev.xyz, a.xyz)) ? 1.0 : 0.0, after && any(notEqual(next.xyz, b.xyz)) ? 1.0 : 0.0);
  vSize = size;
  vPixels = pixels * widen;
  vLight = light / widen;
  vFog = glyphFog(world, clip, uMirror < 0.0);
  gl_Position = clip;
}