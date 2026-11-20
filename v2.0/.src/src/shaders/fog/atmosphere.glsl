// The atmosphere prototype's tables (effects/fog.ts builds them from models/atmosphere.ts when M.ATMOSPHERE; the uniform block is uploaded when the Sky/Orb settings change):
// aSH the sky's light on a surface per unit albedo as nine spherical-harmonics coefficients (rgb), aSky the seen sky's radiance by direction (16 elevations x 12 azimuths, the
// elevation's square root and the azimuth from the Orb's side linear: index (j * 16 + i)), aInfo.xyz the upper hemisphere's mean radiance, aOrb.xy the Orb's horizontal unit direction (x, z)
layout(std140) uniform Atmosphere {
  vec4 aSH[9];
  vec4 aSky[192];
  vec4 aInfo;
  vec4 aOrb;
};
// the seen sky's radiance in the unit direction dir (y up): bilinear in (sqrt(elevation / (pi / 2)) x 15, azimuth / pi x 11); the directions below the horizon read the horizon row
vec3 atmosSeen(vec3 dir) {
  float horizontal = length(dir.xz);
  float elevation = atan(max(dir.y, 0.0), max(horizontal, 1e-6));
  float azimuth = horizontal > 1e-5 ? acos(clamp(dot(dir.xz / horizontal, aOrb.xy), -1.0, 1.0)) : 0.0;
  float fi = sqrt(elevation / 1.57079633) * 15.0;
  float fj = azimuth / PI * 11.0;
  int i = clamp(int(floor(fi)), 0, 14);
  int j = clamp(int(floor(fj)), 0, 10);
  float u = fi - float(i);
  float v = fj - float(j);
  vec3 low = mix(aSky[j * 16 + i].rgb, aSky[j * 16 + i + 1].rgb, u);
  vec3 high = mix(aSky[(j + 1) * 16 + i].rgb, aSky[(j + 1) * 16 + i + 1].rgb, u);
  return mix(low, high, v);
}
// the view ray of the fragment being drawn (the sky-only water program reads the sky by it)
#define ATMOS_FRAG_DIR rayOf(gl_FragCoord.xy)
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
