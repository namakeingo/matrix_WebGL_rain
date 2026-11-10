
const float BELL_SPREAD = ${BELL_SPREAD.toFixed(4)};
const float BELL_PX = ${BELL_PX.toFixed(4)};
const float BELL_LEAST = ${BELL_LEAST.toFixed(4)};
const float BELL_END = ${BELL_END.toFixed(1)};
const float LN2 = 0.69314718;
vec3 bellOf(float pixels) {
  float lambda = max(BELL_SPREAD * pixels, BELL_PX);
  float h = 0.5 * pixels;
  float s2 = h * h / (2.0 * LN2);
  if (s2 / lambda < h) s2 = max(2.0 * lambda * (h - lambda * LN2), BELL_LEAST * BELL_LEAST);
  return vec3(s2, lambda, s2 / lambda);
}
float bellG(float r, vec3 bell) {
  return r <= bell.z ? r * r / (2.0 * bell.x) : bell.z * bell.z / (2.0 * bell.x) + (r - bell.z) / bell.y;
}
// how far it reaches (pixels) with its glow cut at g = end, and a pixel more
float profileReachTo(float pixels, float end) {
  vec3 bell = bellOf(pixels);
  float gt = bell.z * bell.z / (2.0 * bell.x);
  float r = end <= gt ? sqrt(2.0 * bell.x * end) : bell.z + (end - gt) * bell.y;
  return r + 1.0;
}
float profileReach(float pixels) {
  return profileReachTo(pixels, BELL_END);
}
// erf (Abramowitz and Stegun 7.1.26: within 1.5e-7)
float erfOf(float x) {
  float t = 1.0 / (1.0 + 0.3275911 * x);
  return 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x);
}
// the bell's sum across both sides (pixels)
float bellSum(vec3 bell) {
  float gaussian = sqrt(bell.x * 1.5707963) * erfOf(bell.z / sqrt(2.0 * bell.x));
  float tail = exp(-bell.z * bell.z / (2.0 * bell.x)) * bell.y;
  return 2.0 * (gaussian + tail);
}