
uniform highp sampler2D uEmitter;
const int EMITTER_ACROSS = ${M.Flash.TEXELS_ACROSS};
const int EMITTER_ROWS = ${EMITTER_ROWS};
const int REGIONS = ${M.Flash.REGIONS};
const int NODE_TEXELS = ${M.Flash.NODE_TEXELS};
const int NODE_BASE = ${M.Flash.NODE_BASE};
const int SHADOW_POINTS = ${M.Flash.SHADOW_POINTS};
const int VISITS_EACH = ${M.Flash.VISITS_MOST / M.Flash.REGIONS};
const int STACK = ${M.Flash.STACK};
const float THETA = ${M.Flash.THETA.toFixed(4)};
const float EMITTER_NEAREST = ${M.Flash.NEAREST.toFixed(4)};
vec4 emitterTexel(int s, int i) {
  int row = i / EMITTER_ACROSS;
  return texelFetch(uEmitter, ivec2(i - row * EMITTER_ACROSS, s * EMITTER_ROWS + row), 0);
}
// the light a stretch (a to b, 1 a metre) gives at p: its points' 1 / d^2 summed along it,
// (atan((len - along) / h) - atan(-along / h)) / h, as one atan (the angle of the product of
// 1 + i x and 1 - i y, x and y the two quotients, both arguments times h^2)
float pieceLight(vec3 p, vec3 a, vec3 b) {
  vec3 ab = b - a;
  float len = max(length(ab), 1e-4);
  vec3 u = ab / len;
  float along = dot(p - a, u);
  float h = max(length(p - a - along * u), EMITTER_NEAREST);
  return atan(len * h, h * h - along * (len - along)) / h;
}
vec3 nearestOn(vec3 p, vec3 a, vec3 b) {
  vec3 ab = b - a;
  return a + clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0) * ab;
}
// a part's light at p, coming from q: added to the sum and its vector; q kept if nearest
void emitterAdd(vec3 p, vec3 q, float light, inout float sum, inout vec3 vector, inout float best, inout vec3 near) {
  vec3 to = q - p;
  float d = max(length(to), 1e-4);
  sum += light;
  vector += light * to / d;
  if (d < best) {
    best = d;
    near = q;
  }
}
// a node's light as from its centroid (t0: centroid, power)
void emitterFar(vec3 p, vec4 t0, inout float sum, inout vec3 vector, inout float best, inout vec3 near) {
  float d = max(length(t0.xyz - p), EMITTER_NEAREST);
  emitterAdd(p, t0.xyz, t0.w / (d * d), sum, vector, best, near);
}
// region r of slot s's emitter seen from p: its light (returned), its vector (each part's light
// along the way to it), its nearest point and how far; for a surface at p (its normal not 0), a
// node also opened unless its radius is under THETA of its height above it (the light's cosine
// changes fastest near the surface)
float emitterLight(int s, int r, vec3 p, vec3 normal, out vec3 vector, out vec3 near, out float best) {
  bool surface = dot(normal, normal) > 0.0;
  float sum = 0.0;
  vector = vec3(0.0);
  near = p;
  best = 1e9;
  int root = int(emitterTexel(s, r).x);
  if (root < 0) return 0.0;
  int stack[STACK];
  stack[0] = root;
  int depth = 1;
  int visits = int(lCounts.y);
  // (one loop, its one call site of the node's reads and of emitterAdd: the walk first, then what
  // is left on its stack as from its centroids; the same visits and sums in the same order as a
  // walk loop followed by a drain loop, which compiled as two copies of the reads)
  bool walking = true;
  int drain = 0;
  for (int v = 0; v < visits + STACK; v++) {
    if (walking && (v >= VISITS_EACH || depth <= 0 || v >= visits)) walking = false;
    int node;
    if (walking) {
      depth--;
      node = stack[depth];
    } else {
      if (drain >= depth || drain >= STACK) break;
      node = stack[drain];
      drain++;
    }
    int o = NODE_BASE + node * NODE_TEXELS;
    vec4 t0 = emitterTexel(s, o);
    vec4 t1 = emitterTexel(s, o + 1);
    vec4 t2 = emitterTexel(s, o + 2);
    vec3 q;
    float light;
    if (walking && t2.w < 0.0) {
      // (a leaf: its chord's line light carrying its power)
      light = t0.w / max(length(t2.xyz - t1.xyz), 1e-4) * pieceLight(p, t1.xyz, t2.xyz);
      q = nearestOn(p, t1.xyz, t2.xyz);
    } else if (!walking || (t1.w < THETA * length(t0.xyz - p) && (!surface || t1.w < THETA * dot(t0.xyz - p, normal))) || depth + 2 > STACK) {
      // (a node as from its centroid, as emitterFar)
      float d = max(length(t0.xyz - p), EMITTER_NEAREST);
      light = t0.w / (d * d);
      q = t0.xyz;
    } else {
      int child = int(t1.x);
      stack[depth] = child;
      stack[depth + 1] = child + 1;
      depth += 2;
      continue;
    }
    emitterAdd(p, q, light, sum, vector, best, near);
  }
  return sum;
}
// the point of region r of slot s's emitter its shadow through the clouds is cast towards from
// p: the nearest of its shadow points (by its distance less its radius; best: how far, 1e9 for
// none)
vec3 emitterNearest(int s, int r, vec3 p, out float best) {
  vec3 near = p;
  best = 1e9;
  float least = 1e9;
  int count = int(lCounts.z);
  for (int j = 0; j < count; j++) {
    if (j >= SHADOW_POINTS) break;
    vec4 point = emitterTexel(s, REGIONS + r * SHADOW_POINTS + j);
    if (point.w < 0.0) continue;
    float d = length(point.xyz - p);
    if (d - point.w < least) {
      least = d - point.w;
      best = d;
      near = point.xyz;
    }
  }
  return near;
}