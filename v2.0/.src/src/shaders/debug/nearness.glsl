
float nearnessOf(float d, float near, float far) {
  if (d <= 0.0) {
    return 0.0;
  }
  return clamp(log(far / d) / log(far / near), 0.0, 1.0);
}