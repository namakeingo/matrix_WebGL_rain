
uniform vec4 uMainLight;
uniform vec4 uBranchLight;
uniform vec4 uGrown;
uniform float uSlot;
float slotOf(vec4 v, float slot) {
  return slot < 0.5 ? v.x : slot < 1.5 ? v.y : v.z;
}
float itemLight(float kind, float slot) {
  return slotOf(kind > 1.5 ? uMainLight : uBranchLight, slot);
}
// the part of an item grown at a growth, from the growths at its start and its end (one growth for
// both: all of it from then)
float grownPart(float grown, float from, float to) {
  return to > from ? clamp((grown - from) / (to - from), 0.0, 1.0) : grown >= to ? 1.0 : 0.0;
}