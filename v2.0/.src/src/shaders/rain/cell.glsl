
uniform highp sampler2D uDrops;
uniform highp usampler2D uLife;
// 1 with the water off: the drops fall to the bottom of the screen at their distance, not to the water
uniform float uFloor;
// the height of the floor at a distance: the water's y = 0, or where the ray through the screen's bottom row is
// there (eye - distance x tan(the angle below the horizon of the bottom row), the camera block's cScreen.z)
float floorOf(float z) {
  return uFloor * (cEye.y - z * cScreen.z);
}
const float CELL = ${CELL.toFixed(4)};
const uint SEED = ${SEED}u;
const float SPAN = ${M.Camera.SPAN.toFixed(4)};
const int DROPS_ACROSS = ${DROPS_ACROSS};
struct Cell {
  float z;
  uint fall;
  uint row;
  bool drawn;
  // the rows it has fallen in its fall
  uint since;
  // the drop's head: the rows it has fallen in the fall under way; and, for the cell of the fall before at the same age (the head's extension below the floor: the fall that has just
  // ended goes on while the water under it is lower, its rows then under 0), the steps it has been falling
  uint head;
  uint sinceBefore;
  bool drawnBefore;
  // the drop's fourth life word: the water's rows at its landings as the wheel packs them (RainWheel.packMeets): the rows of the fall the table was read for + 8, of the fall before + 8, that
  // fall's low byte, and bit 24 set when there is a table
  uint meet;
};
Cell cellOf(int drop, uint step, int age) {
  ivec2 texel = ivec2(drop % DROPS_ACROSS, drop / DROPS_ACROSS);
  vec4 d = texelFetch(uDrops, texel, 0);
  uvec4 life = texelFetch(uLife, texel, 0);
  uint rows = uint(d.w);
  uint total = (step / 16u) * uint(d.y) + (step % 16u) * uint(d.y) / 16u + uint(d.z);
  uint cycle = total / rows;
  uint head = total - cycle * rows;
  Cell c;
  c.z = d.x;
  c.fall = cycle;
  c.drawn = true;
  uint at;
  c.since = head;
  c.head = head;
  c.meet = life.w;
  if (int(head) >= age) {
    at = head - uint(age);
  } else {
    at = rows + head - uint(age);
    c.fall = cycle - 1u;
    c.drawn = cycle > 0u;
    c.since = rows + head;
  }
  c.row = rows - 1u - at;
  uint was = cycle - 1u;
  c.drawnBefore = cycle > 0u && ((was >= life.x && was < life.y) || was >= life.z);
  c.drawn = c.drawn && ((c.fall >= life.x && c.fall < life.y) || c.fall >= life.z);
  // (as steps since its fall began, in small numbers only: Rain.stepsSince)
  int speed = int(d.y);
  int r = int(step % 16u);
  int num = 16 * ((r * speed) / 16) - 16 * int(c.since);
  int up = num >= 0 ? (num + speed - 1) / speed : -((-num) / speed);
  c.since = uint(r - up);
  int numBefore = 16 * ((r * speed) / 16) - 16 * int(rows + head);
  c.sinceBefore = uint(r - (numBefore >= 0 ? (numBefore + speed - 1) / speed : -((-numBefore) / speed)));
  return c;
}
// the spawn box's sides (models/spawnbox.ts, SpawnBox.halfWidth): x = the half width over z, y = the metres added; the box is inside the world's width (SPAN)
uniform vec2 uSpawn;
float acrossOf(int drop, uint fall, float z) {
  float across = float(hash(((uint(drop) * 2654435761u) ^ (fall * 40503u)) + SEED)) / 4294967296.0;
  return (across * 2.0 - 1.0) * min(z * SPAN, z * uSpawn.x + uSpawn.y);
}