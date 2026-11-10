#version 300 es
precision highp float;
// the picture's size (device pixels) and the scene's shift across (device pixels)
uniform vec2 uSize;
uniform float uShiftPx;
in vec2 aCorner;
// a lit rectangle of the letters: x, y, w, h (device pixels from the screen's top left)
in vec4 aPlace;
// drawn where the scene's picture holds what shows there: the shift taken off
void main() {
  vec2 p = aPlace.xy + aCorner * aPlace.zw - vec2(uShiftPx, 0.0);
  gl_Position = vec4(p.x / uSize.x * 2.0 - 1.0, 1.0 - p.y / uSize.y * 2.0, 0.0, 1.0);
}