// the lit glyphs' vertex GLSL (the rain's and the splashes': after Fog.GLSL, Fog.MEDIUM_GLSL, Fog.SHADE_GLSL and GlyphAtlas.VERTEX_GLSL), what their fragment shader's one lighting term
// reads: the baked shade at the glyph, and the strikes' light the fog already gave.
// the clouds' transmittance towards the sky (x) and the moon (y) at a place of the world (the true place: not the mirror image's), from the baked grid: one read
vec2 glyphShade(vec3 place) {
  return skyShade(place, 0.0, false);
}
// what the fog gives a corner (world, at clip; mirrored: from the mirrored volume): the strikes' light the air scatters towards the eye before it (rgb: the read glyphFog throws away),
// and its transmittance (a): the same read as glyphFog's
vec4 glyphFogStrike(vec3 world, vec4 clip, bool mirrored) {
  vec3 strike;
  vec4 fog = fogAt((clip.xy / clip.w * 0.5 + 0.5) * cScreen.xy, length(world - cEye.xyz), mirrored, strike);
  return vec4(strike, fog.a);
}
