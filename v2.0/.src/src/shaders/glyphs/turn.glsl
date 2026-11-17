// The glyphs' random turn about their own vertical (Y) axis (GlyphTurn in models/glyphturn.ts is the twin): every glyph's quad is turned by an angle between -TURN_MAX and +TURN_MAX,
// fixed by the glyph's seed. Needs hash(uint) (M.HASH_GLSL, included before this chunk). The quad's local right axis is x; turned about its centre it becomes (cos, 0, sin) and its
// normal (-sin, 0, cos): a corner at localX from the centre moves to (localX cos, localX sin) in (x, z). The sine and cosine are made once, in turnCS; the functions taking the angle
// call it, the ones taking its result (cs = vec2(cos, sin)) let a vertex shader make them once and use them for the offset and for the varying the fragment shader reads.
const float TURN_MAX = ${TURN_MAX};
float turnAngle(uint seed) {
  return (float(hash(seed)) / 4294967296.0 * 2.0 - 1.0) * TURN_MAX;
}
vec2 turnCS(float angle) {
  return vec2(cos(angle), sin(angle));
}
vec2 turnOffset(float localX, vec2 cs) {
  return localX * cs;
}
vec2 turnOffset(float localX, float angle) {
  return turnOffset(localX, turnCS(angle));
}
vec3 turnNormal(vec2 cs) {
  return vec3(-cs.y, 0.0, cs.x);
}
vec3 turnNormal(float angle) {
  return turnNormal(turnCS(angle));
}
