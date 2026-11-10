// Custom color k (0 to 3; 4: the first again)
vec3 customColor(int k) {
  return k == 1 ? uColor2 : k == 2 ? uColor3 : k == 3 ? uColor4 : uColor1;
}
// a fall's colour at its place across the world (position, in widths of a 16:9 view from the
// left) and the wave's phase when it began (as Rain.colorOf)
vec3 fallColor(float position, float phase) {
  float wave = fract(position / uWaveWidth - phase);
  if (uCustom) {
    float at = uWave ? wave : clamp(position, 0.0, 1.0);
    int segments = uWave ? 8 : 6;
    int segment = min(int(floor(at * float(segments))), segments - 1);
    float amount = at * float(segments) - float(segment);
    vec3 a = customColor(segment / 2);
    vec3 b = customColor(segment / 2 + 1);
    return clamp(segment % 2 == 0 ? a + b * amount : b + a * (1.0 - amount), 0.0, 1.0);
  }
  float hue = mod((uWave ? wave : position) * 360.0 + 347.0, 360.0);
  vec3 c = clamp(abs(mod(hue / 60.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}