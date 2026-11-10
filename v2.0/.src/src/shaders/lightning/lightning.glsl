
layout(std140) uniform Lightning {
  vec4 lInfo;     // x: the slots to look at (none: no strike gives light)
  vec4 lLight;    // each slot's light (0: none)
  vec4 lCounts;   // the loops' counts at run time: the emitter's regions, the most nodes a
                  // region's walk visits, its shadow points a region, the rays of a slice of
                  // the strikes' light
};
const int GROUPS = ${GROUPS};
// a vector's component i (never v[i] with i not constant: ANGLE's Direct3D 11 emulates each such
// index with a helper of the same name, defined again for each one, and the shader then fails to
// compile at its first draw, losing the context)
float component(vec4 v, int i) {
  return i == 0 ? v.x : i == 1 ? v.y : i == 2 ? v.z : v.w;
}
// a slot's light (0: none)
float strikeLight(int s) {
  return component(lLight, s);
}
int strikeCount() {
  return min(int(lInfo.x), ${MOST});
}
// the loops' counts, read from the block (at run time, so Direct3D's compiler through ANGLE does
// not unroll them; each loop also stops at its constant most)
int flashGroups() {
  return int(lCounts.x);
}
int flashRays() {
  return int(lCounts.w);
}