#version 300 es
precision highp float;
${TEST_VIEWS}
uniform sampler2D uMask;
uniform sampler2D uBoltCover;
uniform sampler2D uBoltNear;
uniform vec3 uColor;
uniform float uMirror;
uniform bool uInked;
#ifdef TEST_VIEWS
uniform float uViewScale;
#endif
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outDistance;
const float FAR_DISTANCE = ${M.Camera.FAR_DISTANCE.toFixed(1)};
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec4 mask = texelFetch(uMask, at, 0);
  vec4 sums = texelFetch(uBoltNear, at, 0);
  bool mirrored = uMirror < 0.0;
  // (the combined shape, and the light its owners carry by their shapes)
  float carried = mirrored ? mask.g : mask.r;
  float weight = mirrored ? sums.a : sums.b;
  if (carried <= 0.0 || weight <= 0.0) discard;
  float shape = 1.0 - exp(-(mirrored ? mask.a : mask.b));
  float light = shape * carried / weight;
  if (uInked) {
    vec4 cover = texelFetch(uBoltCover, at, 0);
    light *= 1.0 - (mirrored ? cover.a : cover.g);
  }
  vec3 color = uColor * light;
#ifdef TEST_VIEWS
  color *= uViewScale;
#endif
  outColor = vec4(color, 1.0);
  outDistance = vec4(FAR_DISTANCE, 0.0, 0.0, 1.0);
}