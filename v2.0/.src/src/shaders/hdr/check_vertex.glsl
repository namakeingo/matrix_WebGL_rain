#version 300 es
// one triangle over the whole picture, from the vertex index (no vertex buffer: the self-check's context has none)
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
