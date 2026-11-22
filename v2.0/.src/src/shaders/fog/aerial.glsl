// The aerial perspective beyond the fog volume (Feature U1, story U3): the span of the atmosphere's air from the volume's far end (AERIAL_FROM = FOG_FAR) to a distance, read from the table under the seen
// sky's rows in the water programs' picture (uSkyTable: models/atmosphere.ts, Atmosphere.picture, which tabulates the closed form for the rays at the horizon: the water's rays are below it). The
// closed form per pixel cost the water program 238 ms of compile time; this is two filtered reads.
//
// aerialSpan(d, end, T, L): the unit ray d (below the horizon), `end` the distance it ends at (the water's hit). T (per channel) is what the span lets through, L the span's own light; the colour seen
// through the span is colour T + L (times what is nearer to the eye lets through). end <= AERIAL_FROM gives T 1 and L 0 exactly. The table's column is the azimuth from the Orb's horizontal direction
// (aOrb.xy): u = sin(az / 2) = sqrt((1 - cos az) / 2) at AERIAL_W nodes, its row the distance in logarithm, s = ln(end / AERIAL_FROM) / ln(AERIAL_TO / AERIAL_FROM) at AERIAL_H nodes, each node at its texel's
// centre. The transmittance rows come first (AERIAL_ROW_T), the light rows after them (AERIAL_ROW_L). Pure arithmetic and the picture's reads: the unit tests run this very text in Node.
const float AERIAL_W = ${AERIAL_W};
const float AERIAL_H = ${AERIAL_H};
const float AERIAL_FROM = ${AERIAL_FROM};
const float AERIAL_LOG_SCALE = ${AERIAL_LOG_SCALE};
const float AERIAL_ROW_T = ${AERIAL_ROW_T};
const float AERIAL_ROW_L = ${AERIAL_ROW_L};
void aerialSpan(vec3 d, float end, out vec3 T, out vec3 L) {
  float c = dot(d.xz, aOrb.xy) / max(length(d.xz), 1.0e-6);
  float u = sqrt(0.5 * max(1.0 - c, 0.0));
  float s = clamp(log(max(end, AERIAL_FROM) / AERIAL_FROM) * AERIAL_LOG_SCALE, 0.0, 1.0);
  float x = (u * (AERIAL_W - 1.0) + 0.5) / SKY_W;
  float row = s * (AERIAL_H - 1.0) + 0.5;
  T = textureLod(uSkyTable, vec2(x, (AERIAL_ROW_T + row) / PICTURE_H), 0.0).rgb;
  L = textureLod(uSkyTable, vec2(x, (AERIAL_ROW_L + row) / PICTURE_H), 0.0).rgb;
}
