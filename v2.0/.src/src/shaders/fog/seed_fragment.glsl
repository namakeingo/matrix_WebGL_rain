#version 300 es
precision highp float;
precision highp int;
uniform int uLayer;
out vec4 outColor;
${M.HASH_GLSL}
void main() {
  uvec3 c = uvec3(uvec2(gl_FragCoord.xy), uint(uLayer));
  outColor = vec4(float(hash(c.x + c.y * ${NOISE}u + c.z * ${NOISE * NOISE}u + 7919u)) / 4294967296.0, 0.0, 0.0, 1.0);
}