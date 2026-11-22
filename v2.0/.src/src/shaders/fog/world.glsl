// The world-fixed fog volume read (Feature U1, story U8, a prototype: only compiled with the test option fogWorld; models/fogworld.ts is its CPU reference). The medium's per-unit-length extinction
// and scattered light in two 3D textures fixed in the world, on the units of the camera-fixed volumes (uFogDirect: A, rgb the light scattered per metre without the moon's phase function, a the
// extinction per metre; uFogMirror: B, rgb the moon's scattered light per metre before the phase function), read by a march along the ray with the volume's slice law, a trilinear read of both
// at each step's middle, front to back: L += T s (1 - e^-tau) / sigma, T *= e^-tau. Defined in the uniform block's reading text (after sliceAt, before fogAt), so every program that reads the
// fog has it; the number of steps (at most 96) is given in the block (fParams.z - 100).
#define FOG_WORLD
const vec3 WORLD_CELLS = vec3(${WORLD_CELLS});
const float WORLD_TOP = ${WORLD_TOP};
const float WORLD_NEAR = ${WORLD_NEAR};
const float WORLD_LOG = ${WORLD_LOG};
const float WORLD_SPAN = ${WORLD_SPAN};
${WORLD_PHASE}
// a world place as texture coordinates of the world grid (the shadow grid's mapping: x / distance across, the height's square root, the distance's logarithm; the nodes the texels' middles)
vec3 worldCoord(vec3 p) {
  float z = max(-p.z, WORLD_NEAR);
  vec3 g = clamp(vec3((p.x / z / WORLD_SPAN + 1.0) * 0.5, sqrt(max(p.y, 0.0) / WORLD_TOP), log(z / WORLD_NEAR) / WORLD_LOG), 0.0, 1.0);
  return (g * (WORLD_CELLS - 1.0) + 0.5) / WORLD_CELLS;
}
// what the medium gives along the ray through a place of the screen from the eye to the distance t (mirrored: along the ray's image below the water, from where it meets still water): its
// light (rgb) and what it lets through (a); the steps' middles and widths from the volume's law over the stretch
vec4 fogAtWorld(vec2 at, float t, bool mirrored, int steps) {
  vec3 d = rayOf(at);
  float t0 = 0.0;
  if (mirrored) {
    if (d.y >= 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
    t0 = cEye.y / -d.y;
  }
  float reach = min(t, FOG_FAR) - t0;
  if (reach <= 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
  vec3 view = mirrored ? vec3(d.x, -d.y, d.z) : d;
  float phase = worldPhaseHG(dot(normalize(MOON_DIR), view));
  float scale = reach / FOG_FAR;
  float from = 0.0;
  float pass = 1.0;
  vec3 light = vec3(0.0);
  for (int i = 0; i < 96; i++) {
    if (i >= steps) break;
    float to = sliceAt(float(i + 1) / float(steps)) * scale;
    vec3 p = cEye.xyz + (t0 + 0.5 * (from + to)) * d;
    if (mirrored) p.y = -p.y;
    vec3 c = worldCoord(p);
    vec4 a = textureLod(uFogDirect, c, 0.0);
    vec3 b = textureLod(uFogMirror, c, 0.0).rgb;
    float width = to - from;
    float through = exp(-a.a * width);
    light += pass * (a.rgb + b * phase) * ((1.0 - through) / a.a);
    pass *= through;
    from = to;
  }
  return vec4(light, pass);
}
