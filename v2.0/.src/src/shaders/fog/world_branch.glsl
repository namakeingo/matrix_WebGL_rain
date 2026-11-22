#ifdef FOG_WORLD
  // (z over 100: the world grid is the fog, the steps of its march z - 100)
  if (fParams.z > 1.5) return fogAtWorld(at, t, mirrored, int(fParams.z - 99.5));
#endif
