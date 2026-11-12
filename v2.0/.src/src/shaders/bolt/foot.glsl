// A point of a strike's lines that is the water's end (y = 0, exactly as the shape's foot is) rests on the live wave at its place (x, distance), the other points where they are: the
// foot only, the lines tilt a little. The points a vertex reads share one wave read: the first of them at y = 0 gives the place (the foot is one place; the vertex program carries one
// call of the wave's bilinear read, which the vertex stage pays for at every call site). 0 when none is at y = 0 (needs lift.glsl with WAVE_LIFT_AT)
float footLift(vec3 a, vec3 b, vec3 c, vec3 d) {
  vec3 at = a.y == 0.0 ? a : b.y == 0.0 ? b : c.y == 0.0 ? c : d;
  return at.y == 0.0 ? waveLiftAt(vec2(at.x, -at.z)) : 0.0;
}
