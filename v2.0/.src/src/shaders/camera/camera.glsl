
layout(std140) uniform Camera {
  mat4 cViewProj;
  vec4 cEye;      // the eye; w: the focal length (pixels)
  vec4 cForward;  // w: the near plane
  vec4 cRight;    // w: the far plane
  vec4 cUp;
  vec4 cScreen;   // the screen's width and height (pixels); z: the tangent of the angle below
                  // the horizon of the bottom of the screen
};
const float FAR_DISTANCE = ${Camera.FAR_DISTANCE.toFixed(1)};
// the ray from the eye through a pixel (gl_FragCoord's place)
vec3 rayOf(vec2 fc) {
  return normalize(cForward.xyz + (fc.x - cScreen.x * 0.5) / cEye.w * cRight.xyz + (fc.y - cScreen.y * 0.5) / cEye.w * cUp.xyz);
}