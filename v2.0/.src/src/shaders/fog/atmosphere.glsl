// The atmosphere's tables, the only sky (effects/fog.ts builds them from models/atmosphere.ts; the uniform block is uploaded when the Sky/Orb brightness, the Air tone or the Orb tone change):
// aSH the sky's light on a surface per unit albedo as nine spherical-harmonics coefficients (rgb), aInfo.xyz the upper hemisphere's mean radiance, aOrb.xy the Orb's horizontal unit direction (x, z). The picture is SKY_W x PICTURE_H: the seen sky in its first SKY_H rows, then a copy of the last, then the aerial span's table (aerial.glsl).
// The seen sky's radiance by direction is the picture uSkyTable (256 x 128 RGBA16F, LINEAR, CLAMP_TO_EDGE; Atmosphere.skyTexture: the 16 x 12 table resampled over an octahedral map of the
// direction in the Orb's frame), one filtered read with no trigonometry and no indexed table (the water program has three copies of the lookup, and their compile time was most of the sky's cost)
layout(std140) uniform Atmosphere {
  vec4 aSH[9];
  vec4 aInfo;
  vec4 aOrb;
};
uniform highp sampler2D uSkyTable;
const float SKY_W = ${SKY_W};
const float SKY_V = ${SKY_V};
const float PICTURE_H = ${PICTURE_H};
// the seen sky's radiance in the unit direction dir (y up) (the sky's rows are the picture's first SKY_H of PICTURE_H: v is scaled by SKY_V): q = (dir.xz . aOrb.xy, |dir.xz x aOrb.xy|, max(dir.y, 0)) is the direction in the Orb's frame (the directions below the horizon read the
// horizon row), p = q.xy / (|q.x| + q.y + q.z) its octahedral coordinates, and the picture at (p.x / 2 + 1 / 2, p.y); textureLod: the level 0 with no derivatives, whatever the flow around it
vec3 atmosSeen(vec3 dir) {
  vec3 q = vec3(dot(dir.xz, aOrb.xy), abs(dir.x * aOrb.y - dir.z * aOrb.x), max(dir.y, 0.0));
  vec2 p = q.xy / max(abs(q.x) + q.y + q.z, 1e-6);
  return textureLod(uSkyTable, vec2(p.x * 0.5 + 0.5, p.y * SKY_V), 0.0).rgb;
}
// the sky's light on a surface with the unit normal n, per unit albedo: the nine real spherical harmonics (order (0,0) (1,-1) (1,0) (1,1) (2,-2) (2,-1) (2,0) (2,1) (2,2)), clamped at 0
vec3 atmosDiffuse(vec3 n) {
  vec3 c = aSH[0].rgb * 0.282095
    + aSH[1].rgb * (0.488603 * n.y) + aSH[2].rgb * (0.488603 * n.z) + aSH[3].rgb * (0.488603 * n.x)
    + aSH[4].rgb * (1.092548 * n.x * n.y) + aSH[5].rgb * (1.092548 * n.y * n.z)
    + aSH[6].rgb * (0.315392 * (3.0 * n.z * n.z - 1.0))
    + aSH[7].rgb * (1.092548 * n.x * n.z) + aSH[8].rgb * (0.546274 * (n.x * n.x - n.y * n.y));
  return max(c, vec3(0.0));
}
// the upper hemisphere's mean radiance (the fog's isotropic term)
vec3 atmosAmbient() {
  return aInfo.xyz;
}
// the sky seen in the mirror's picture at a place of the screen: the mirror image (y flipped) of the view's ray there
vec3 atmosSeenMirror(vec2 at) {
  vec3 r = rayOf(at);
  return atmosSeen(vec3(r.x, abs(r.y), r.z));
}
