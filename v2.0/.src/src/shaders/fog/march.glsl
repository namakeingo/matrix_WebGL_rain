
${M.HASH_GLSL}
float pixelJitter(ivec2 pixel) {
  return float(hash(uint(pixel.x) * 1973u + uint(pixel.y) * 9277u) % 1024u) / 1024.0;
}
vec4 fogMarch(vec3 o, vec3 d, float t0, float t1, bool mirrored, float jitter) {
  float a = max(t0, 0.05);
  float b = max(t1, a + 0.001);
  vec3 view = mirrored ? vec3(d.x, -d.y, d.z) : d;
  vec3 light = vec3(0.0);
  float pass = 1.0;
  // (its count at run time, at most 96: not unrolled)
  int segments = int(fBolt.w);
  for (int i = 0; i < segments; i++) {
    if (i >= 96) break;
    float s0 = a * pow(b / a, float(i) / 96.0);
    float s1 = a * pow(b / a, float(i + 1) / 96.0);
    float dt = s1 - s0;
    float t = mix(s0, s1, jitter);
    vec3 p = o + t * d;
    if (mirrored) p.y = -p.y;
    float lod = lodOf(t / cEye.w);
    float sigma = density(p, lod);
    float extinction = sigma + AIR;
    vec3 source = vec3(0.0);
    if (sigma > 0.0) source += sigma * fogLight(p, view, lod, true);
    light += pass * (1.0 - exp(-extinction * dt)) / extinction * source;
    pass *= exp(-extinction * dt);
  }
  return vec4(light, pass);
}