#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
precision highp sampler2DArray;
${TEST_VIEWS}
${COVERED}
${LIT}
uniform sampler2DArray uAtlas;
uniform float uMirror;
${color}
uniform float uHead;
#ifdef TEST_VIEWS
uniform float uViewScale;
#ifdef LIT
// (the tests: the lit term's gain, and a normal for it in place of the glyph's, w over 0)
uniform float uLitScale;
uniform vec4 uLitNormal;
#endif
#endif
// (Debug mode's Nearness view: the character's real distance from the eye as a grey, where its
// ink is solid; uNearFar the rain's nearest and furthest distances)
uniform bool uNearness;
uniform vec2 uNearFar;
${M.Camera.GLSL}
${glsl.fog}
${glsl.waves}
${M.Nearness.GLSL}
${RELIEF_GLSL}
in vec2 vUv;
flat in int vGlyph;
in float vLight;
in float vHead;
in vec3 vWorld;
#ifdef LIT
// the baked shade at the glyph (x: from the sky, y: from the moon, through the clouds) and the strikes' light the air scatters towards the eye before it
flat in vec2 vShade;
in vec3 vStrike;
#endif
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outDistance;
const float INK_SOLID = 0.3;
const float HEAD_GAIN = ${HEAD_GAIN.toFixed(1)};
#ifdef COVERED
uniform bool uCovered;
uniform sampler2D uBoltCover;
uniform highp sampler2D uBoltNear;
const float NEAR_SCALE = ${NEAR_SCALE.toFixed(1)};
const float COVER_BEHIND = ${COVER_BEHIND.toFixed(3)};
// (the lines' cover added where they overlap: at most the bolt's own, as one shape)
const float LINE_COVER = ${(covered ? M.Bolt.COVER : 0).toFixed(4)};
// what the bolt's line and characters in front of this character let through of it (1: nothing
// covers it)
float uncovered() {
  if (!uCovered) return 1.0;
  // (the bolt's textures are the view's size: the mirrored picture is larger by a margin on each side, in cUp.w across and cScreen.w down, 0 in the view's own block)
  ivec2 margin = ivec2(cUp.w, cScreen.w);
  ivec2 at = ivec2(gl_FragCoord.xy) - margin;
  if (any(lessThan(at, ivec2(0))) || any(greaterThanEqual(at, ivec2(cScreen.xy) - 2 * margin))) return 1.0;
  vec4 sums = texelFetch(uBoltNear, at, 0);
  vec4 cover = texelFetch(uBoltCover, at, 0);
  bool mirrored = uMirror < 0.0;
  // (the lines' nearness, their mean by their shapes)
  float weight = mirrored ? sums.a : sums.b;
  float n = weight > 0.0 ? (mirrored ? sums.g : sums.r) / weight : 0.0;
  vec2 c = mirrored ? cover.ba : cover.rg;
  return n > 0.0 && n * length(vWorld - cEye.xyz) > NEAR_SCALE * COVER_BEHIND ? (1.0 - min(c.x, LINE_COVER)) * (1.0 - c.y) : 1.0;
}
#endif
void main() {
  // (the glyph's uv footprint in a pixel, before any branch: derivatives)
  float footprint = max(length(dFdx(vUv)), length(dFdy(vUv)));
  // (the quad's own normal, facing the camera, with 3D Symbols off; with it on the ink is read at the parallax's uv and the normal is the relief's)
  vec3 normal = vec3(0.0, 0.0, 1.0);
  float ink;
  if (uSymbols3d) {
    Relief relief = reliefAt(vUv, vGlyph, vWorld, footprint);
    ink = relief.ink;
    normal = relief.normal;
  } else {
    ink = texture(uAtlas, vec3(vUv, float(vGlyph))).r;
  }
  // (under the water: only within the highest wave of the water is the wave there looked at)
  if (ink <= 0.0 || (abs(vWorld.y) < highestWave() && abs(vWorld.y) < waveHeight(vec2(vWorld.x, -vWorld.z)))) discard;
  if (uNearness) {
    if (ink < INK_SOLID) discard;
    outColor = vec4(vec3(nearnessOf(length(vWorld - cEye.xyz), uNearFar.x, uNearFar.y)), 1.0);
    outDistance = vec4(FAR_DISTANCE, 0.0, 0.0, 1.0);
    return;
  }
  vec3 head = mix(COLOR, vec3(1.0), uHead) * (1.0 + HEAD_GAIN * uHead);
#ifdef LIT
  // the glyph's own emission plus ONE term of the light it reflects, in the same pass: its colour as the albedo times the sky box's and the moon's light on the normal (the
  // mirror image shows the same glyph, so the same normal) and the strikes' light; all times the trail's fade and the fog's transmittance (vLight), the character fading as a whole
#ifdef TEST_VIEWS
  if (uLitNormal.w > 0.0) normal = normalize(uLitNormal.xyz);
  vec3 lit = COLOR * (glyphSkyMoonLight(normal, vShade) + vStrike) * uLitScale;
#else
  vec3 lit = COLOR * (glyphSkyMoonLight(normal, vShade) + vStrike);
#endif
  vec3 light = (mix(COLOR, head, vHead) + lit) * ink * max(vLight, 0.0);
#else
  vec3 light = mix(COLOR, head, vHead) * ink * max(vLight, 0.0);
#endif
#ifdef COVERED
  light *= uncovered();
#endif
#ifdef TEST_VIEWS
  light *= uViewScale;
#endif
  outColor = vec4(light, 1.0);
  outDistance = vec4(ink >= INK_SOLID ? length(vWorld - cEye.xyz) : FAR_DISTANCE, 0.0, 0.0, 1.0);
}