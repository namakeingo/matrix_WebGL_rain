// Hiding behind a crest (models/crest.ts, M.CrestHide, is the twin): the water pass writes, per pixel, the eye's distance to the crest it shows into the crest picture (R32F, its own unit
// M.UNITS.crest), CREST_FAR where there is none. A glyph fragment farther from the eye than that crest, by more than the bias, is behind it. One read of the picture at the fragment's own pixel; no
// wave height read and no march (the water program keeps its one waveHit call site). Needs the camera block (cEye). Included by the programs that draw glyphs; the callers test uCrestHide
// (the water program's global gate: off, the picture holds CREST_FAR everywhere) and the main pass (uMirror >= 0: the mirrored pass is never hidden) first.
uniform highp sampler2D uCrest;
uniform bool uCrestHide;
const float CREST_FAR = ${CREST_FAR};
const float CREST_BIAS = ${CREST_BIAS};
const float CREST_REL_BIAS = ${CREST_REL_BIAS};
bool behindCrest(vec3 world) {
  float crest = texelFetch(uCrest, ivec2(gl_FragCoord.xy), 0).r;
  return crest < CREST_FAR && length(world - cEye.xyz) > crest + CREST_BIAS + CREST_REL_BIAS * crest;
}
