// Webpack loader for the shaders (.glsl, .wgsl): the file's text as a module's default export,
// its line endings LF whatever the checkout's (a shader's text is the same on every machine).
// TypeScript run by Node.js as it is (its types stripped); webpack's loader runner takes the ES
// module's default export.
import type { LoaderContext } from "webpack";

export default function textLoader(this: LoaderContext<Record<string, never>>, source: string): string {
  return `export default ${JSON.stringify(source.replace(/\r\n/g, "\n"))};`;
}
