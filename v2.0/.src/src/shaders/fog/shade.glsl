
uniform highp sampler3D uShade;
uniform highp sampler3D uStrikeShade;
// what gets to p from the sky (x) and the moon (y) through the clouds: baked, or marched
vec2 skyShade(vec3 p, float lod, bool marched) {
  if (marched) return skyShadeMarched(p, lod);
  if (p.y >= SHADE_TOP) return vec2(exp(-AIR * 8.0));
  return textureLod(uShade, shadeCoord(p), 0.0).rg;
}
// what gets to p from each group of strike slot s's channel through the clouds (baked; under
// SHADE_TOP)
vec4 strikeShadeAt(int s, vec3 p) {
  vec3 c = shadeCoord(p);
  c.z = (float(s) + c.z) / STRIKE_SLOTS;
  return textureLod(uStrikeShade, c, 0.0);
}
// the light the clouds scatter towards the eye at p (seen along view), per unit of density
vec3 fogLight(vec3 p, vec3 view, float lod, bool marched) {
  vec3 albedo = albedoAt(p, lod);
  vec3 moon = normalize(MOON_DIR);
  vec2 shade = skyShade(p, lod, marched);
  vec3 single = SKY * shade.x + MOON * shade.y * phaseHG(dot(moon, view));
  return albedo * (single + MULTIPLE * (SKY + MOON / FOUR_PI));
}