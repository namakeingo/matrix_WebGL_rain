#version 300 es
precision highp float;
// the picture's size (device pixels)
uniform vec2 uSize;
in vec2 aCorner;
// a lit rectangle of the letters: x, y, w, h (device pixels from the screen's top left)
in vec4 aPlace;
// drawn at the letters' own place (the scene's picture is already shifted by the camera's lens)
void main() {
  vec2 p = aPlace.xy + aCorner * aPlace.zw;
  gl_Position = vec4(p.x / uSize.x * 2.0 - 1.0, 1.0 - p.y / uSize.y * 2.0, 0.0, 1.0);
}