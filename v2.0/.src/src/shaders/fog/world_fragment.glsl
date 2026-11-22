#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
${TEST_VIEWS}
${M.Camera.GLSL}
${Fog.GLSL}
${Fog.MEDIUM_GLSL}
${Fog.SHADE_GLSL}
${Fog.TEST_GLSL}
// a layer of both world textures (Feature U1, story U8): the cell's place on the shadow grid's mapping, its medium and its light, the clouds' shadow read from the baked shade
// grid (the same light the volume's gather scatters: fogLight, split into the part that does not depend on the view, A, and the moon's, B, before its phase function)
uniform int uLayer;
layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;
void main() {
  vec3 p = shadePlace(vec3(floor(gl_FragCoord.xy), float(uLayer)));
  float lod = shadeLod(p);
  float sigma = density(p, lod);
  float mist = MIST_K * exp(-max(p.y, 0.0) / MIST_HEIGHT);
  float extinction = sigma + AIR_EXTINCTION + mist;
  vec3 source = vec3(0.0);
  vec3 moon = vec3(0.0);
  if (sigma + mist > 1e-6) {
    vec3 albedo = vec3(mist);
    if (sigma > 0.0) albedo += sigma * albedoAt(p, lod);
    vec2 shade = skyShade(p, lod, false);
    vec3 sky = atmosAmbient();
    source = albedo * (sky * shade.x + MULTIPLE * (sky + MOON / FOUR_PI));
    moon = albedo * MOON * shade.y;
  }
  outA = vec4(source, extinction);
  outB = vec4(moon, 1.0);
}
