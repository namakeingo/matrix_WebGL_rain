
uniform highp sampler3D uShade;
uniform highp sampler3D uStrikeShade;
// what gets to p from the sky (x) and the moon (y) through the clouds and, where the base mist's volume is there with its shade (the block's fSecond.w over 1.5), through the base mist: the front grid's read (baked, or marched)
// times the base grid's (baked once: the layers after the front's in the same texture), one function, two fetches of the one sampler
vec2 skyShade(vec3 p, float lod, bool marched) {
  vec3 c = shadeCoord(p);
  vec2 shade = textureLod(uShade, vec3(c.xy, c.z * SHADE_FRONT), 0.0).rg;
  if (marched) shade = skyShadeMarched(p, lod);
  else if (p.y >= SHADE_TOP) shade = vec2(exp(-AIR_EXTINCTION * 8.0));
  if (fSecond.w > 1.5) shade *= textureLod(uShade, vec3(c.xy, SHADE_BASE + c.z * SHADE_FRONT), 0.0).rg;
  return shade;
}
// what gets to p from each group of strike slot s's channel through the clouds (baked; under
// SHADE_TOP)
vec4 strikeShadeAt(int s, vec3 p) {
  vec3 c = shadeCoord(p);
  c.z = (float(s) + c.z) / STRIKE_SLOTS;
  return textureLod(uStrikeShade, c, 0.0);
}
// the light the medium (density sigma: the front cloud, or the base mist) scatters, with the clouds' albedo (the two fog colours mixed by the noise) towards the eye at p (seen along view): sigma x albedo x the light around
vec3 fogLight(vec3 p, vec3 view, float lod, bool marched, float sigma) {
  vec3 albedo = sigma * albedoAt(p, lod);
  vec3 moon = normalize(MOON_DIR);
  vec2 shade = skyShade(p, lod, marched);
  vec3 sky = atmosAmbient();
  vec3 single = sky * shade.x + MOON * shade.y * phaseHG(dot(moon, view));
  return albedo * (single + MULTIPLE * (sky + MOON / FOUR_PI));
}