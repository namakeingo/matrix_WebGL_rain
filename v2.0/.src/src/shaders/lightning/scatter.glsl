
float strikeUnit(int s, vec3 p, vec3 view, float lod, bool marched) {
  bool above = p.y >= SHADE_TOP;
  vec4 baked = marched || above ? vec4(1.0) : strikeShadeAt(s, p);
  float sum = 0.0;
  int groups = flashGroups();
  for (int n = 0; n < groups; n++) {
    if (n >= GROUPS) break;
    vec3 vector;
    vec3 near;
    float best;
    float e = emitterLight(s, n, p, vec3(0.0), vector, near, best);
    if (e <= 0.0) continue;
#ifdef TEST_VIEWS
    // (the tests' marched view: towards the region's nearest shadow point; not in the shipped source)
    float towardsBest;
    vec3 shadowPoint = marched ? emitterNearest(s, n, p, towardsBest) : near;
    float shade = marched ? through(p, shadowPoint, 3, lod) : above ? exp(-AIR * best) : component(baked, n);
#else
    float shade = above ? exp(-AIR * best) : component(baked, n);
#endif
    vec3 towards = dot(vector, vector) > 0.0 ? normalize(vector) : normalize(near - p);
    sum += e * shade * phaseHG(dot(towards, view));
  }
  return sum;
}