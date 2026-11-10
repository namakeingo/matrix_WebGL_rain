// A shader's text (shaders/, imported as text) with its placeholders filled: each ${NAME} replaced
// by String(values[NAME]), as a template literal would put the value there. NAME is everything
// between the braces (braces inside it balanced); a placeholder without a value is an error, so a
// shader is never compiled with one left in it.

export type ShaderValue = string | number | boolean;

export function fill(text: string, values: Readonly<Record<string, ShaderValue>>): string {
  let out = "";
  let from = 0;
  for (;;) {
    const at = text.indexOf("${", from);
    if (at < 0) {
      return out + text.slice(from);
    }
    let depth = 1;
    let end = at + 2;
    while (end < text.length && depth > 0) {
      const c = text[end];
      if (c === "{") {
        depth++;
      } else if (c === "}") {
        depth--;
      }
      end++;
    }
    const name = text.slice(at + 2, end - 1);
    if (!Object.prototype.hasOwnProperty.call(values, name)) {
      throw new Error(`a shader's placeholder without a value: \${${name}}`);
    }
    out += text.slice(from, at) + String(values[name]);
    from = end;
  }
}
