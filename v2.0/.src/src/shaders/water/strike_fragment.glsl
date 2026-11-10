#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
${TEST_VIEWS}
${M.Camera.GLSL}
${glsl.fog}
${glsl.medium}
${glsl.shade}
${glsl.test}
${glsl.lightning}
${glsl.emitter}
${Water.GRID_GLSL}
uniform int uSlot;
layout(location = 0) out vec4 outLight;
void main() {
  vec3 s = gridPlace(gl_FragCoord.xy / GRID_CELLS);
  float lod = shadeLod(s);
  vec4 baked = uMarched ? vec4(1.0) : strikeShadeAt(uSlot, s);
  vec3 sum = vec3(0.0);
  float far = 0.0;
  float total = 0.0;
  int groups = flashGroups();
  for (int n = 0; n < groups; n++) {
    if (n >= GROUPS) break;
    vec3 vector;
    vec3 near;
    float best;
    float e = emitterLight(uSlot, n, s, vec3(0.0, 1.0, 0.0), vector, near, best);
    if (e <= 0.0) continue;
    // (marched as baked: towards the region's nearest shadow point)
    float towardsBest;
    float pass = uMarched ? through(s, emitterNearest(uSlot, n, s, towardsBest), 8, lod) : component(baked, n);
    sum += vector * pass;
    far += e * pass * best;
    total += e * pass;
  }
  outLight = vec4(sum * GRID_SCALE, total > 0.0 ? far / total : 0.0);
}