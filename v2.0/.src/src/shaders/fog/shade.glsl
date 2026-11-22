
uniform highp sampler3D uShade;
uniform highp sampler3D uStrikeShade;
// what gets to p from the sky (x) and the moon (y) through the clouds: baked, or marched
vec2 skyShade(vec3 p, float lod, bool marched) {
  if (marched) return skyShadeMarched(p, lod);
  if (p.y >= SHADE_TOP) return vec2(exp(-AIR_EXTINCTION * 8.0));
  return textureLod(uShade, shadeCoord(p), 0.0).rg;
}
// what gets to p from each group of strike slot s's channel through the clouds (baked; under
// SHADE_TOP)
vec4 strikeShadeAt(int s, vec3 p) {
  vec3 c = shadeCoord(p);
  c.z = (float(s) + c.z) / STRIKE_SLOTS;
  return textureLod(uStrikeShade, c, 0.0);
}
// the light the clouds (density sigma, their albedo) and the white mist (extinction mist) scatter towards the eye at p (seen along view): (sigma x albedo + mist) x the light around
vec3 fogLight(vec3 p, vec3 view, float lod, bool marched, float sigma, float mist) {
  vec3 albedo = vec3(mist);
  if (sigma > 0.0) albedo += sigma * albedoAt(p, lod);
  vec3 moon = normalize(MOON_DIR);
  vec2 shade = skyShade(p, lod, marched);
  vec3 sky = atmosAmbient();
  vec3 single = sky * shade.x + MOON * shade.y * phaseHG(dot(moon, view));
  return albedo * (single + MULTIPLE * (sky + MOON / FOUR_PI));
}