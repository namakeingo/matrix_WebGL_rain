${glsl.lightning}
${glsl.emitter}
uniform int uSlot;
// (what gets to p from region g, towards its nearest shadow point: 1 for a region the emitter
// does not have)
float groupShade(vec3 p, int g, float lod) {
  if (g >= GROUPS) return 1.0;
  float best;
  vec3 near = emitterNearest(uSlot, g, p, best);
  return best < 1e8 ? through(p, near, 4, lod) : 1.0;
}
// (one call for all the groups, in a loop of a count given at run time: not unrolled)
vec4 groups(vec3 p) {
  float lod = shadeLod(p);
  vec4 v = vec4(1.0);
  int count = flashGroups();
  for (int g = 0; g < count; g++) {
    if (g >= 4) break;
    float shade = groupShade(p, g, lod);
    if (g == 0) v.x = shade;
    else if (g == 1) v.y = shade;
    else if (g == 2) v.z = shade;
    else v.w = shade;
  }
  return v;
}