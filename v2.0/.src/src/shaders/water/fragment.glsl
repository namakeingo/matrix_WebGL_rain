#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
${TEST_VIEWS}
${FLOAT_PICTURES}
${M.Camera.GLSL}
${glsl.fog}
${glsl.medium}
${glsl.shade}
${glsl.test}
${glsl.lightning}
${march}
${glsl.waves}
${modes}
uniform sampler2D uReflection;
uniform highp sampler2D uReflectionDistance;
uniform float uStrength;
uniform bool uCovered;
// the mirrored picture's margin past the view on each side (whole pixels: Reflection's frame; 0: the picture is the view). A place of the view (pixels) is the
// picture's texel at the place plus the margin; the picture is the view's size plus twice the margin
uniform vec2 uMirrorMargin;
// the water off: no surface, the rays below the horizon show the sky and the fog of the rays mirrored upwards
uniform bool uWaterOff;
// the glossy read on: the reflection's mip chain is made (off, while the waves are calm: every beam is under a pixel, the point read)
uniform bool uGlossOn;
// (Debug mode's Nearness view: the water's real distance from the eye as a grey, the sky 0)
uniform bool uNearness;
uniform vec2 uNearFar;
${M.Nearness.GLSL}
uniform sampler2D uBoltCover;
uniform highp sampler2D uBoltNear;
const float NEAR_SCALE = ${M.GlyphAtlas.NEAR_SCALE.toFixed(1)};
${Water.GRID_GLSL}
uniform highp sampler2DArray uStrikeWater;
// (each slot's bakes done: its light shown)
uniform vec4 uStrikeReady;
// (the lines' cover added where they overlap: at most the bolt's own, as one shape)
const float LINE_COVER = ${M.Bolt.COVER.toFixed(4)};
#ifdef TEST_VIEWS
uniform int uMode;
uniform bool uNoWaterLight;
uniform int uTestReflection;
uniform float uFogDistance;
uniform float uViewScale;
uniform bool uNoWaveShadow;
uniform bool uNoStrikeWater;
uniform bool uNoFilteredNormal;
uniform bool uNoGlossyRead;
#else
const int uMode = MODE_SCENE;
const bool uNoWaterLight = false;
const int uTestReflection = 0;
const bool uNoWaveShadow = false;
const bool uNoStrikeWater = false;
const bool uNoFilteredNormal = false;
const bool uNoGlossyRead = false;
#endif
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outReflected;
const int SHADOW_MOST = 256;
const int BLOCK_STEPS = 128;
const float SHADOW_BIAS = 0.0005;
// the glossy read: a pixel's reflected beam under this many pixels wide (in its longer side) is read
// as one texel, as on still water; the distance the beams' directions are projected at; the distance
// a beam is taken to travel when the point read found no ink to give it
const float GLOSS_MIN = 1.25;
const float GLOSS_REF = 100.0;
const float GLOSS_NOMINAL = 8.0;
// a strike's light on the water fainter than this (HDR) is not marched past the waves
const float FAINT = 1e-4;
// the water's albedo, and the share of a strike's light it scatters back (Lambert, 1 / pi)
const vec3 WATER_ALBEDO = vec3(${WATER_ALBEDO.map((v) => v.toFixed(2)).join(", ")});
const float WATER_DIFFUSE = ${WATER_DIFFUSE};
// Plane tone: the body light's tint, linear light (white 1, 1, 1: the water unchanged)
uniform vec3 uTone;
// the ripples' brightness strengths (strength / 100 x RIPPLE_GAIN each) and the evaluations a pixel makes: 1 (both
// strengths 0: the water as is) or 2 (the ripples' normal, then the flat one)
uniform float uRippleHighlights;
uniform float uRippleShadows;
uniform int uRipplePasses;
// the flat path's tolerance (pixels of the mirrored picture's shift, at most; 0: never taken) and the largest
// strike light (HDR, summed over the strikes) a flat pixel may have, both from the waves' own bounds (see flatWater)
uniform float uFlatPx;
const float FLAT_STRIKE = 2e-4;
// the level of detail (models/quality/waves.ts), all off with uFlatPx 0: a pixel's level, as its block's, is ceil(40 footprint transmittance)
// (footprint: its cell's larger side in pixels over FOOTPRINT_FULL_PX, at least 1/40); the strike-shadow march's coarse steps lowered by the
// level's stride (every second from STRIDE_2, every fourth from STRIDE_4, every eighth below); a strike's light times the fog's transmittance
// under STRIKE_CUT is not marched; the water's light under FOG_CUT of the fog's transmittance is not shaded at all
const float FOOTPRINT_FULL_PX = ${FOOTPRINT_FULL_PX};
const int STRIDE_1 = ${STRIDE_1};
const int STRIDE_2 = ${STRIDE_2};
const int STRIDE_4 = ${STRIDE_4};
const float STRIKE_CUT = ${STRIKE_CUT};
const float FOG_CUT = ${FOG_CUT};

// the pixel's level of detail, 1 to 40: its cell (cellSize there) over the pixel's footprint on the water (foot), the fog's transmittance t
int waterLevel(vec2 xz, vec2 foot, float t) {
  vec2 px = cellSize(xz.y) / max(foot, vec2(1e-6));
  float f = clamp(max(px.x, px.y) / FOOTPRINT_FULL_PX, 1.0 / 40.0, 1.0);
  return clamp(int(ceil(40.0 * f * t)), 1, 40);
}
// the march's stride for a level
int shadowStride(int level) {
  return level >= STRIDE_1 ? 1 : level >= STRIDE_2 ? 2 : level >= STRIDE_4 ? 4 : 8;
}

// the water's pixels whose normal is the flat one to within the waves' own bound: the mean slope over the pixel's box
// (foot: its sizes on the water; the box the normal is taken over, half the footprint at least a cell) is, per axis, at
// most the highest wave over the box's half width (the two sides' heights differ by at most twice the highest wave), so
// the normal differs from straight up by at most eps = H * sqrt(1 / wx^2 + 1 / wz^2). H is the highest wave of all, or,
// for a box that, a cell more each way (the heights are read bilinearly), lies within 2 x 2 of the blocks of 4 x 4 cells,
// the highest of those blocks. The normal's error moves the mirrored read by at most 2 eps pixels per radian of view
// (pxPerRad, the projection's largest, at the screen's corner) and the strikes' light by eps times its sum: flat when the
// shift is under uFlatPx pixels and the strikes' light error under FLAT_STRIKE. A flat pixel takes the normal straight
// up, no heights read, no second evaluation, no glossy read (a beam of one pixel on flat water).
bool flatWater(vec2 xz, vec2 foot, float t) {
#ifdef FLOAT_PICTURES
  if (uFlatPx <= 0.0) return false;
  // (the tolerance grows as the light falls: its error times the transmittance stays what it is in clear air, at most a pixel)
  float flatPx = min(uFlatPx / max(t, uFlatPx), 1.0);
  vec2 c = cellSize(xz.y);
  vec2 w = max(c, 0.5 * foot);
  float p00 = length(vec3(cViewProj[0][0], cViewProj[1][0], cViewProj[2][0]));
  float p11 = length(vec3(cViewProj[0][1], cViewProj[1][1], cViewProj[2][1]));
  float pxPerRad = 0.5 * max(cScreen.x * p00, cScreen.y * p11) * (1.0 + 1.0 / (p00 * p00) + 1.0 / (p11 * p11));
  float strikes = 0.0;
  for (int k = 0; k < strikeCount(); k++) {
    strikes += max(strikeLight(k), 0.0);
  }
  float perH = sqrt(1.0 / (w.x * w.x) + 1.0 / (w.y * w.y));
  float limit = min(flatPx / (2.0 * pxPerRad), FLAT_STRIKE / max(strikes * max(BOLT.r, max(BOLT.g, BOLT.b)), 1e-6));
  float top = highestWave();
  if (top * perH < limit) return true;
  vec2 r = w + c;
  if (2.0 * r.x <= 4.0 * c.x && 2.0 * r.y <= 4.0 * c.y) {
    float local = max(max(blockTop(xz + vec2(-r.x, -r.y)), blockTop(xz + vec2(r.x, -r.y))), max(blockTop(xz + vec2(-r.x, r.y)), blockTop(xz + vec2(r.x, r.y))));
    return local * perH < limit;
  }
#endif
  return false;
}

// the light the water reflects diffusely at s (normal n): its albedo lit by the sky box and the moon (the one light term of the fog's shared text: the sky box's
// SKY x (1 + n.y) / 2 x the clouds' transmittance, which for an upward normal is SKY x shade.x, and MOON x max(n.m, 0) / PI x the moon's)
vec3 waterOwnShaded(vec2 shade, vec3 n) {
  return WATER_ALBEDO * uTone * glyphSkyMoonLight(n, shade);
}
// the moon's disc seen in the water's mirror, along the reflected unit direction r over the glossy beam a pixel covers (footprint: its angular radius, from
// the reflected direction's change a pixel across): the disc's radiance MOON / solid angle over the part of the beam it covers, its edge smoothed over the
// squared angle (the light kept is exact: the integral over the sphere is pi s^2 for the radius s = the larger of the disc's and the beam's), a beam wider
// than the disc spreading the disc's light over its width, times the clouds' transmittance towards the moon. (materials/sky.ts: MoonDisc.glint)
vec3 moonGlint(vec3 r, float footprint, float moonShade) {
  vec3 m = normalize(MOON_DIR);
  if (dot(r, m) <= 0.0) return vec3(0.0);
  vec3 across = cross(r, m);
  float delta2 = dot(across, across);
  float s = max(MOON_RADIUS, footprint);
  float s2 = s * s;
  float cover = 1.0 - smoothstep(0.6 * s2, 1.4 * s2, delta2);
  float spread = (MOON_RADIUS * MOON_RADIUS) / s2;
  return MOON_RADIANCE * (cover * spread * moonShade);
}
vec3 waterOwn(vec3 s, vec3 n, float lod) {
  return waterOwnShaded(skyShade(s, lod, uMarched), n);
}

// the ripples' light (ripple) pushed away from the same water still (still) by the strengths, per channel: brighter
// by highlights, darker by shadows, never below 0
vec3 rippleGain(vec3 still, vec3 ripple) {
  vec3 delta = ripple - still;
  vec3 k = mix(vec3(uRippleShadows), vec3(uRippleHighlights), greaterThan(delta, vec3(0.0)));
  return max(ripple + delta * k, 0.0);
}

// the mirrored picture's light at a place of the screen (pixels) over the beam a water pixel's
// reflection covers there: major its longer side (a vector, pixels), minor its shorter (at least 1).
// Over a pixel or less (a flat mirror), the texel itself. Wider: the mean light over the beam, as
// up to 4 reads along its longer side, each of the picture's mip level as wide as the beam's width
// there (a level is the exact mean of the texels it covers: the light is kept, spread)
vec3 glyphsOver(vec2 at, vec2 major, float minor) {
  float len = length(major);
  if (len < GLOSS_MIN) return texelFetch(uReflection, ivec2(at + uMirrorMargin), 0).rgb;
  vec2 pictureSize = cScreen.xy + 2.0 * uMirrorMargin;
  int n = clamp(int(ceil(len / minor - 0.01)), 1, 4);
  float level = log2(max(len / float(n), minor));
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    if (i >= n) break;
    vec2 p = at + major * ((float(i) + 0.5) / float(n) - 0.5);
    sum += textureLod(uReflection, (p + uMirrorMargin) / pictureSize, level).rgb;
  }
  return sum / float(n);
}

// what the mirrored picture shows at a place of the screen: the sky behind (the water's own mirror: the
// sky, the moon, the fog), covered where the bolt's mirrored line and characters lie in front of it
// (uCovered: past their nearness only what their opacities leave, the mirrored fog's light in front of
// them kept), returned; the characters there (the mirrored scene: the drops, the splashes, the bolt) in
// scene, apart; the emitters' share of both (the characters' light and the strikes' the fog scatters)
// in emitted
vec3 mirroredAt(vec2 at, vec2 major, float minor, out vec3 emitted, out vec3 scene) {
  vec2 edge = cScreen.xy * fVolume.w;
  vec3 glyphs = vec3(0.0);
  // (the picture holds the view and its margin; the bolt's cover pictures are the view's alone: the cover is not applied past the view)
  bool inside = all(greaterThanEqual(at, -uMirrorMargin)) && all(lessThan(at, cScreen.xy + uMirrorMargin));
  bool onScreen = all(greaterThanEqual(at, vec2(0.0))) && all(lessThan(at, cScreen.xy));
  if (inside) glyphs = glyphsOver(at, major, minor);
  // (the bolt's cover over this place: its opacity c and the nearness of what covers it)
  float c = 0.0;
  float near = 0.0;
  if (uCovered && onScreen) {
    vec4 cover = texelFetch(uBoltCover, ivec2(at), 0);
    vec4 sums = texelFetch(uBoltNear, ivec2(at), 0);
    near = sums.a > 0.0 ? sums.g / sums.a : 0.0;
    c = 1.0 - (1.0 - min(cover.b, LINE_COVER)) * (1.0 - cover.a);
  }
  bool covered = c > 0.0 && near > 0.0;
  // the mirrored fog read once in a loop (so its code is in the program once): iteration 0 the sky's, with the strikes' share of its light; iteration 1, only where the
  // bolt covers, the fog in front of what covers it
  vec3 sky = vec3(0.0);
  vec3 strike = vec3(0.0);
  vec3 front = vec3(0.0);
  vec3 frontStrike = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    if (i == 1 && !covered) break;
    vec3 share;
    vec4 fog = fogAt(i == 0 ? clamp(at, -edge, cScreen.xy + edge) : at, i == 0 ? FOG_FAR : NEAR_SCALE / near, true, share);
    if (i == 0) {
      sky = SKY * fog.a + fog.rgb;
      strike = share;
    } else {
      front = fog.rgb;
      frontStrike = share;
    }
  }
  if (covered) {
    sky -= c * (sky - front);
    strike -= c * (strike - frontStrike);
  }
  emitted = glyphs + strike;
  scene = glyphs;
  return sky;
}

// the light the water reflects at s (hit along the eye's ray) along r, without the mirrored scene (the
// drops, the splashes, the bolt: in scene, apart); the emitters' share of both also in emitted.
// With gloss, the mirrored light is read over the beam the pixel's reflection covers: the screen
// step between neighbouring pixels' reflected directions (drx, dry: the reflected direction's change a
// pixel across and down), taken far away (the directions projected from the eye at GLOSS_REF: on
// flat water exactly the pixel's own step, one pixel) and, as the beam widens only along the way
// it travels (L from the surface to the ink, or GLOSS_NOMINAL where the point read found none),
// its excess over that step scaled by L / (L + the eye's distance to the surface). ownShaded: the water's own light for the normal n (waterOwnShaded of the sky shade
// at s: what a ray reflected downwards shows), computed once by the caller
vec3 reflectedAt(vec3 s, float hit, vec3 r, vec3 n, ivec2 pixel, float lod, bool gloss, vec3 drx, vec3 dry, vec3 ownShaded, out vec3 emitted, out vec3 scene) {
  emitted = vec3(0.0);
  scene = vec3(0.0);
  if (uTestReflection == 1) return vec3(1.0);
  if (uTestReflection >= 3 && r.y < 0.0) return vec3(0.0);
  if (r.y < 0.0) return ownShaded;
  vec2 at = vec2(pixel) + 0.5;
  float ink = FOG_FAR;
  for (int k = 0; k < 2; k++) {
    bool inside = all(greaterThanEqual(at, -uMirrorMargin)) && all(lessThan(at, cScreen.xy + uMirrorMargin));
    // (the distance picture holds distances only in half floats: without them, 8 bits clamp it)
#ifdef FLOAT_PICTURES
    ink = inside ? min(texelFetch(uReflectionDistance, ivec2(at + uMirrorMargin), 0).r, FOG_FAR) : FOG_FAR;
#else
    ink = FOG_FAR;
#endif
    vec3 q = s + max(ink - hit, 0.01) * r;
    q.y = -q.y;
    vec4 c = cViewProj * vec4(q, 1.0);
    if (c.w <= 0.0) break;
    at = (c.xy / c.w * 0.5 + 0.5) * cScreen.xy;
  }
  if (uTestReflection == 2) return vec3(clamp(at / cScreen.xy, 0.0, 1.0), 0.0);
  // (the tests' displacement views, 3 across and 4 down: the lookup's displacement from the pixel's own place as a share of the size, +-0.2 over 16 bits in red (whole
  // 255ths) and green (their fraction); blue 1 for a water pixel whose ray is reflected up)
  if (uTestReflection >= 3) {
    vec2 shift = (at - (vec2(pixel) + 0.5)) / cScreen.xy;
    float v = clamp((uTestReflection == 3 ? shift.x : shift.y) * 2.5 + 0.5, 0.0, 1.0) * 255.0;
    return vec3(floor(v) / 255.0, fract(v), 1.0);
  }
  vec2 major = vec2(0.0);
  float minor = 1.0;
  if (gloss && uGlossOn && !uNoGlossyRead) {
    vec4 c0 = cViewProj * vec4(cEye.xyz + vec3(r.x, -r.y, r.z) * GLOSS_REF, 1.0);
    vec3 rx = r + drx;
    vec3 ry = r + dry;
    vec4 cx = cViewProj * vec4(cEye.xyz + vec3(rx.x, -rx.y, rx.z) * GLOSS_REF, 1.0);
    vec4 cy = cViewProj * vec4(cEye.xyz + vec3(ry.x, -ry.y, ry.z) * GLOSS_REF, 1.0);
    if (c0.w > 0.0 && cx.w > 0.0 && cy.w > 0.0) {
      float travel = ink < FOG_FAR ? max(ink - hit, 0.05) : GLOSS_NOMINAL;
      float k = travel / (travel + hit);
      vec2 p0 = c0.xy / c0.w * 0.5 * cScreen.xy;
      vec2 stepX = vec2(1.0, 0.0) + k * ((cx.xy / cx.w * 0.5 * cScreen.xy - p0) - vec2(1.0, 0.0));
      vec2 stepY = vec2(0.0, 1.0) + k * ((cy.xy / cy.w * 0.5 * cScreen.xy - p0) - vec2(0.0, 1.0));
      float lx = length(stepX);
      float ly = length(stepY);
      major = lx >= ly ? stepX : stepY;
      minor = max(min(lx, ly), 1.0);
    }
  }
  return mirroredAt(at, major, minor, emitted, scene);
}

// is the way from the water at s along l (len long) under the waves somewhere, as far as it is
// under the highest wave: cell by cell of the grid (the tests' marched), or by half blocks, the
// cells looked at only where the ray is under its blocks' highest wave
bool behindWaves(vec3 s, vec3 l, float len, int stride) {
  if (uNoWaveShadow) return false;
  float reach = l.y > 1e-4 ? min(len, (highestWave() - s.y) / l.y) : len;
  if (reach <= 0.0) return false;
  vec3 far = s + reach * l;
  vec2 ga = gridAt(vec2(s.x, -s.z));
  vec2 gb = gridAt(vec2(far.x, max(-far.z, 1e-3)));
  float span = max(abs(gb.x - ga.x), abs(gb.y - ga.y));
  if (uMarched) {
    int cells = min(int(span) + 2, SHADOW_MOST);
    for (int j = 1; j <= cells; j++) {
      vec3 p = s + reach * float(j) / float(cells) * l;
      if (p.y < waveHeight(vec2(p.x, -p.z)) - SHADOW_BIAS) return true;
    }
    return false;
  }
  int steps = min(int(span / 2.0) + 2, BLOCK_STEPS);
  // (the level's stride: fewer coarse steps, never under 2, or the whole when there are no more)
  if (stride > 1) steps = max(min(2, steps), (steps + stride - 1) / stride);
  // (one loop whose pass 0 only reads the first block's top, so the block read's code is in the program once)
  float top0 = 0.0;
  for (int j = 0; j <= steps; j++) {
    float t0 = reach * float(max(j - 1, 0)) / float(steps);
    float t1 = reach * float(j) / float(steps);
    vec3 p1 = s + t1 * l;
    float top1 = blockTop(vec2(p1.x, -p1.z));
    float low = s.y + min(t0, t1) * l.y - abs(t1 - t0) * max(-l.y, 0.0);
    if (j > 0 && low - SHADOW_BIAS < max(top0, top1)) {
      for (int k = 1; k <= 4; k++) {
        vec3 p = s + mix(t0, t1, float(k) / 4.0) * l;
        if (p.y < waveHeight(vec2(p.x, -p.z)) - SHADOW_BIAS) return true;
      }
    }
    top0 = top1;
  }
  return false;
}

// the strikes' light on the water at s (normal n): each strike's, its grid's cell there (one
// lookup: its light's vector through the clouds, the light a surface facing n gets n . vector),
// past the waves in its way along it; with the ripples' gain (uRipplePasses 2) the light on still
// water too, in sumStill (the same lookups and shadows, only n . vector with the flat normal)
vec3 strikesOnWater(vec3 s, vec3 n, float lod, float transmittance, int stride, out vec3 sumStill) {
  vec3 sum = vec3(0.0);
  sumStill = vec3(0.0);
  vec2 g = gridOf(s);
  if (any(lessThan(g, vec2(0.0))) || any(greaterThan(g, vec2(1.0)))) return sum;
  for (int k = 0; k < strikeCount(); k++) {
    if (strikeLight(k) <= 0.0 || component(uStrikeReady, k) < 0.5) continue;
    vec4 cell = textureLod(uStrikeWater, vec3(g, float(k)), 0.0);
    vec3 vector = cell.xyz / GRID_SCALE;
    float e = max(dot(n, vector), 0.0);
    float eStill = uRipplePasses > 1 ? max(vector.y, 0.0) : 0.0;
    if (e <= 0.0 && eStill <= 0.0) continue;
    vec3 light = BOLT * strikeLight(k) * e;
    vec3 lightStill = BOLT * strikeLight(k) * eStill;
    // (light too faint to see is not marched past the waves)
    float peak = max(max(light.r, max(light.g, light.b)), max(lightStill.r, max(lightStill.g, lightStill.b)));
    if (!uMarched && peak * WATER_DIFFUSE / PI < FAINT) continue;
    // (the level of detail: light that the fog leaves under the strikes' share of one level of the picture is not marched)
    if (uFlatPx > 0.0 && peak * WATER_DIFFUSE / PI * transmittance < STRIKE_CUT) continue;
    if (behindWaves(s, normalize(vector), max(cell.w, 1e-3), stride)) continue;
    sum += light;
    sumStill += lightStill;
  }
  sumStill *= WATER_DIFFUSE / PI;
  return sum * WATER_DIFFUSE / PI;
}

void main() {
  vec3 d = rayOf(gl_FragCoord.xy);
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  outReflected = vec4(0.0, 0.0, 0.0, 1.0);
#ifdef TEST_VIEWS
  // (the fog views: the modes from MODE_FOGT on, but the glint view, numbered after them)
  if (uMode >= MODE_FOGT && uMode != MODE_WATERGLINT) {
    bool mirrored = uMode == MODE_MIRRORFOGT || uMode == MODE_MIRRORFOGTMARCH;
    bool march = uMode == MODE_FOGTMARCH || uMode == MODE_FOGLIGHTMARCH || uMode == MODE_MIRRORFOGTMARCH;
    if (mirrored && d.y >= 0.0) {
      outColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    float t0 = mirrored ? cEye.y / -d.y : 0.0;
    vec4 fog = march ? fogMarch(cEye.xyz, d, t0, uFogDistance, mirrored, pixelJitter(pixel)) : fogAt(gl_FragCoord.xy, uFogDistance, mirrored);
    bool light = uMode == MODE_FOGLIGHT || uMode == MODE_FOGLIGHTMARCH;
    outColor = vec4(light ? fog.rgb * uViewScale : vec3(fog.a), 1.0);
    return;
  }
  if (uMode == MODE_REFLECTIONPICTURE) {
    vec3 emitted;
    vec3 scene;
    vec3 skyMirror = d.y < 0.0 && !uWaterOff ? mirroredAt(gl_FragCoord.xy, vec2(0.0), 1.0, emitted, scene) : vec3(0.0);
    outColor = vec4(d.y < 0.0 && !uWaterOff ? skyMirror + scene : texelFetch(uReflection, pixel + ivec2(uMirrorMargin), 0).rgb, 1.0);
    return;
  }
  if (uMode == MODE_WATERMASK) {
    outColor = vec4(vec3(d.y < 0.0 && !uWaterOff ? 1.0 : 0.0), 1.0);
    return;
  }
#endif
  bool water = uMode != MODE_SKY && d.y < 0.0 && !uWaterOff;
  float hit = water ? cEye.y / -d.y : 0.0;
  // (the distance's change over one pixel, for the Nearness view's lines: derivatives taken before any branch)
  float hitStep = fwidth(hit);
  // the water's normal (averaged over the pixel's footprint on the water: the way to the next pixel's
  // ray across and down) and the reflected direction's change a pixel across and down: derivatives
  // taken before any branch
  vec2 foot = vec2(0.0);
  vec3 sPre = cEye.xyz + hit * d;
  if (water && !uNoFilteredNormal) {
    for (int k = 0; k < 2; k++) {
      vec3 dk = rayOf(gl_FragCoord.xy + (k == 0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0)));
      if (dk.y < -1e-4) {
        vec3 sk = cEye.xyz + (cEye.y / -dk.y) * dk;
        foot = max(foot, abs(vec2(sk.x - sPre.x, sk.z - sPre.z)));
      }
    }
  }
  // the fog along the eye's ray to the water, with the strikes' light in it (the last term over the pixel: the same read, made first, as the
  // flat tolerance, the level and the cut need its transmittance)
  vec3 strike = vec3(0.0);
  vec4 fog = vec4(0.0, 0.0, 0.0, 1.0);
  // (one read for both cases, so the fog's code is in the program once here: the water's pixel and the hit distance, or, with the water off below the
  // horizon, the pixel the mirrored ray crosses and the far distance)
  float end = FOG_FAR;
  if (water) end = hit;
  vec2 fogPixel = gl_FragCoord.xy;
  if (!water && uWaterOff && d.y < 0.0) {
    vec4 up = cViewProj * vec4(cEye.xyz + vec3(d.x, -d.y, d.z), 1.0);
    vec2 margin = cScreen.xy * fVolume.w;
    if (up.w > 0.0) fogPixel = clamp((up.xy / up.w * 0.5 + 0.5) * cScreen.xy, -margin, cScreen.xy + margin);
  }
  fog = fogAt(fogPixel, end, false, strike);
  float transmittance = water ? fog.a : 1.0;
#ifdef TEST_VIEWS
  bool sceneView = uMode == MODE_SCENE;
#else
  const bool sceneView = true;
#endif
  // (the level of detail: water whose light the fog leaves under FOG_CUT of the picture is the fog's colour alone)
  // (not a return: the derivatives below are taken by every pixel of a quad)
  bool unseen = water && uFlatPx > 0.0 && sceneView && !uNearness && transmittance < FOG_CUT;
  bool isFlat = water && (unseen || flatWater(vec2(sPre.x, -sPre.z), foot, transmittance));
  vec3 nPre = water && !isFlat ? waterNormalOver(vec2(sPre.x, -sPre.z), foot) : vec3(0.0, 1.0, 0.0);
  vec3 rPre = reflect(d, nPre);
  vec3 drx = dFdx(rPre);
  vec3 dry = dFdy(rPre);
  if (uNearness) {
    float grey = water ? nearnessOf(hit, uNearFar.x, uNearFar.y) : 0.0;
    // red lines where the distance is a multiple of 2 m (from 2 m): solid within half a pixel of the
    // multiple, gone at 1.5 pixels, so 1 to 2 px wide whatever the distance
    float offLine = abs(hit - max(2.0 * floor(hit * 0.5 + 0.5), 2.0)) / max(hitStep, 1e-6);
    float line = water ? 1.0 - smoothstep(0.5, 1.5, offLine) : 0.0;
    outColor = vec4(mix(vec3(grey), vec3(1.0, 0.0, 0.0), line), 1.0);
    return;
  }
  vec3 color = unseen ? vec3(0.0) : SKY;
  vec3 reflected = vec3(0.0);
  if (water && !unseen) {
    vec3 s = cEye.xyz + hit * d;
    float lod = lodOf(hit / cEye.w);
#ifdef TEST_VIEWS
    if (uMode == MODE_WATERDISTANCE) {
      outColor = vec4(floor(hit) / 255.0, fract(hit), 0.0, 1.0);
      return;
    }
#endif
    vec3 n = nPre;
    vec3 litStill = vec3(0.0);
    int level = uFlatPx > 0.0 ? waterLevel(vec2(sPre.x, -sPre.z), foot, transmittance) : 40;
    vec3 lit = strikeCount() > 0 && !uNoStrikeWater ? strikesOnWater(s, n, lod, transmittance, shadowStride(level), litStill) : vec3(0.0);
    // the water's light for the ripples' normal (pass 0) and, with the ripples' gain, the flat one (pass 1): one loop,
    // its count a value at run time (the bound checked inside)
    vec2 shade = skyShade(s, lod, uMarched);
    vec3 mirrored = vec3(0.0);
    vec3 colorStill = vec3(0.0);
    vec3 reflectedStill = vec3(0.0);
    // the mirrored scene's light (the drops, the splashes, the bolt) at the Reflection strength: added after the
    // ripples' gain, which acts on the water's own light and shadows only
    vec3 sceneLight = vec3(0.0);
    // the moon's glint on the ripples' normal, times the Fresnel reflectance (a mirror's light: not in the pass's body light, not in the ripples' gain, not in
    // the bloom's source)
    vec3 glintLight = vec3(0.0);
    int passes = isFlat ? 1 : uRipplePasses;
    for (int pass = 0; pass < passes; pass++) {
      if (pass >= 2) break;
      vec3 nn = pass == 0 ? n : vec3(0.0, 1.0, 0.0);
      vec3 em;
      vec3 scn;
      vec3 ownShaded = waterOwnShaded(shade, nn);
      vec3 mir = reflectedAt(s, hit, reflect(d, nn), nn, pixel, lod, pass == 0 && !isFlat, drx, dry, ownShaded, em, scn);
      vec3 litPass = pass == 0 ? lit : litStill;
      // (the Fresnel reflectance of the water: the Reflection strength does not scale it, the water keeps its full look)
      float fPass = min(${WATER_F0} + ${1 - WATER_F0} * pow(1.0 - max(dot(-d, nn), 0.0), 5.0), 1.0);
      vec3 ownPass = uNoWaterLight ? vec3(0.0) : ownShaded + litPass * uTone;
      vec3 colorPass = ownPass * (1.0 - fPass) + mir * fPass;
      // (the emitters' light in it: the strikes' it reflects diffusely, and the strikes' share of its mirror; the mirrored scene's is
      // added with it after the gain)
      vec3 reflectedPass = (uNoWaterLight ? vec3(0.0) : litPass * uTone) * (1.0 - fPass) + (em - scn) * fPass;
      if (pass == 0) {
        if (!isFlat) glintLight = moonGlint(reflect(d, nn), 0.5 * max(length(drx), length(dry)), shade.y) * fPass;
        mirrored = mir + scn * uStrength;
        sceneLight = scn * uStrength * fPass;
        color = colorPass;
        reflected = reflectedPass;
      } else {
        colorStill = colorPass;
        reflectedStill = reflectedPass;
      }
    }
    if (passes > 1) {
      color = rippleGain(colorStill, color);
      reflected = rippleGain(reflectedStill, reflected);
    }
    color += sceneLight + glintLight;
    reflected += sceneLight;
#ifdef TEST_VIEWS
    if (uMode == MODE_REFLECTION) {
      outColor = vec4(mirrored, 1.0);
      return;
    }
    if (uMode == MODE_WATEROWN) {
      outColor = vec4(waterOwn(s, n, lod) * uViewScale, 1.0);
      return;
    }
    if (uMode == MODE_WATERGLINT) {
      outColor = vec4(glintLight * uViewScale, 1.0);
      return;
    }
    if (uMode == MODE_WATERLIGHT) {
      outColor = vec4(lit * uViewScale, 1.0);
      return;
    }
#endif
  }
#ifdef TEST_VIEWS
  else if (uMode == MODE_WATERDISTANCE || uMode == MODE_REFLECTION || uMode == MODE_WATERLIGHT || uMode == MODE_WATEROWN || uMode == MODE_WATERGLINT) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
#endif
  // (the fog of the pixels that are not water was read above, with the water-off mirrored ray's pixel)
  outColor = vec4(color * fog.a + fog.rgb, 1.0);
#ifdef TEST_VIEWS
  if (uMode == MODE_SKY) outColor.rgb *= uViewScale;
#endif
  outReflected = vec4(reflected * fog.a + strike, 1.0);
}