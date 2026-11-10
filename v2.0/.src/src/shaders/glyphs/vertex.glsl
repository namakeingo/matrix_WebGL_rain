
const float GLYPH_MARGIN = 0.1;
bool glyphShown(vec4 clip) {
  return clip.w > 0.0 && all(lessThanEqual(abs(clip.xy), vec2(clip.w * (1.0 + GLYPH_MARGIN))));
}
float glyphFog(vec3 world, vec4 clip, bool mirrored) {
  return fogAt((clip.xy / clip.w * 0.5 + 0.5) * cScreen.xy, length(world - cEye.xyz), mirrored).a;
}