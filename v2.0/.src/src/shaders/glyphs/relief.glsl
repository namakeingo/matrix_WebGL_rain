// The glyphs' relief ("3D Symbols"), the GLSL twin of models/glyphrelief.ts: the atlas read as if the ink were raised RELIEF (1/5 of the glyph's size, the glyph spanning 1 in uv)
// above the quad. Needs uAtlas, uMirror and the camera block; LIT (the rain's and the splashes' fragment shaders) adds the normal.
uniform bool uSymbols3d;
const float RELIEF = ${RELIEF.toFixed(4)};
const int RELIEF_STEPS = ${RELIEF_STEPS};
const float RELIEF_VIEW_MIN = ${RELIEF_VIEW_MIN.toFixed(4)};
const float RELIEF_SKIP_PX = ${RELIEF_SKIP_PX.toFixed(4)};
const float RELIEF_NORMAL_FOOTPRINT = ${RELIEF_NORMAL_FOOTPRINT.toFixed(4)};
const float RELIEF_ATLAS = ${RELIEF_ATLAS.toFixed(1)};
struct Relief {
  vec2 uv;
  float ink;
  vec3 normal;
};
float reliefInk(vec2 uv, int layer, float lod) {
  return textureLod(uAtlas, vec3(uv, float(layer)), lod).r;
}
// what the pixel at uv of the quad at `world` (as drawn: mirrored below the water) shows of a glyph's layer: the uv it looks up (the parallax), the ink there and, for the lit
// programs, the glyph's own normal (the world's: up is y, the quad faces +z). footprint: the uv a pixel spans (the larger of the two axes).
// The ray from the pixel to the eye is at uv + w z at the height z over the quad: w the view's xy over its z in uv units, the uv's v running down the glyph (the world's y on a
// quad drawn as it is, its opposite on the mirror image, whose y is flipped: uMirror). It is stepped from RELIEF down to the quad, the crossing taken between the last two
// samples. The normal is the height's gradient over one texel of the level read; the glyph's own normal serves the mirror image too (it shows the same glyph, lit by the same lights).
Relief reliefAt(vec2 uv, int layer, vec3 world, float footprint) {
  float lod = clamp(log2(max(footprint * RELIEF_ATLAS, 1.0)), 0.0, 6.0);
  Relief r;
  r.uv = uv;
  r.normal = vec3(0.0, 0.0, 1.0);
  vec3 view = normalize(cEye.xyz - world);
  vec2 w = vec2(view.x, -uMirror * view.y) / max(view.z, RELIEF_VIEW_MIN);
  if (RELIEF * length(w) > RELIEF_SKIP_PX * footprint) {
    float previousGap = 0.0;
    float previousZ = 0.0;
    float hit = 0.0;
    for (int k = 0; k <= RELIEF_STEPS; k++) {
      float z = RELIEF * (1.0 - float(k) / float(RELIEF_STEPS));
      float gap = z - RELIEF * reliefInk(uv + w * z, layer, lod);
      if (gap <= 0.0) {
        hit = k == 0 ? z : previousZ + (z - previousZ) * previousGap / (previousGap - gap);
        break;
      }
      previousGap = gap;
      previousZ = z;
    }
    r.uv = uv + w * hit;
  }
  r.ink = reliefInk(r.uv, layer, lod);
#ifdef LIT
  if (r.ink > 0.0 && footprint < RELIEF_NORMAL_FOOTPRINT) {
    float d = exp2(lod) / RELIEF_ATLAS;
    float k = RELIEF / (2.0 * d);
    float across = reliefInk(r.uv + vec2(d, 0.0), layer, lod) - reliefInk(r.uv - vec2(d, 0.0), layer, lod);
    float down = reliefInk(r.uv + vec2(0.0, d), layer, lod) - reliefInk(r.uv - vec2(0.0, d), layer, lod);
    r.normal = normalize(vec3(-k * across, k * down, 1.0));
  }
#endif
  return r;
}
