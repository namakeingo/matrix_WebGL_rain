#version 300 es
in vec2 aCorner;
void main() {
  gl_Position = vec4(aCorner * 2.0 - 1.0, 0.0, 1.0);
}