// The build of matrix_web_3d_rain: the TypeScript sources (src/, entry src/index.ts) and their
// shaders (src/shaders/, as text) bundled and minified into one script,
// matrix_web_3d_rain/dist/bundle.js, which the page and every worker load (each worker by its
// name: see src/index.ts). No source map (Wallpaper Engine uploads every file of the project
// folder). Types are checked by tsc before (npm run build); ts-loader only transpiles.
// The bundle registers itself whole (Matrix3DFactory("bundle", body)): a worker that cannot be
// made from the bundle's URL is made from a Blob of that body's own text, with no fetch.
// This config is TypeScript run by Node.js as it is (its types stripped: only erasable syntax,
// type-checked by tsconfig.tools.json); webpack-cli loads it with import().
// Options (npm run build -- --env NAME=VALUE):
//   swap=SOURCE=FILE  FILE in place of the source module SOURCE (a path under src/, e.g.
//                     models/boltshape.ts): a proof copy, broken on purpose
//   out=FILE          the bundle written to FILE (from the repository's root) instead
//   coverage=1        a bundle for measuring test coverage (npm run coverage): not minified, its modules not merged, with a source map beside it (never the shipped bundle)
import path from "node:path";
import webpack from "webpack";
import TerserPlugin from "terser-webpack-plugin";
import type { Compiler, Configuration, ResolveData, WebpackPluginInstance } from "webpack";

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, "..", "..");
const SRC = path.join(HERE, "src");

// the registering function every bundle starts with: it records its body by name and runs it
// (the same text as platform/workers.ts's FACTORY)
const FACTORY = "((name, body) => { (self.Matrix3DFactories = self.Matrix3DFactories || {})[name] = body; body(); })";

// the options given with --env (webpack-cli adds its own flags, WEBPACK_BUILD and others, beside
// them)
interface BuildEnv {
  swap?: string;
  out?: string;
  coverage?: unknown;
  [flag: string]: unknown;
}

class RegisterBundle implements WebpackPluginInstance {
  apply(compiler: Compiler): void {
    compiler.hooks.thisCompilation.tap("RegisterBundle", (compilation) => {
      compilation.hooks.processAssets.tap({ name: "RegisterBundle", stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER }, (assets) => {
        for (const name of Object.keys(assets)) {
          if (!name.endsWith(".js")) continue;
          // (in a worker the scripts' window is the worker's scope)
          const head = `(self.Matrix3DFactory=self.Matrix3DFactory||${FACTORY.replace(/\s+/g, " ")})("bundle",()=>{self.window||(self.window=self);`;
          compilation.updateAsset(name, (source) => new webpack.sources.ConcatSource(head, source, "\n});"));
        }
      });
    });
  }
}

export default (env: BuildEnv = {}): Configuration => {
  const plugins: WebpackPluginInstance[] = [new RegisterBundle()];
  if (env.swap) {
    const [from, to] = String(env.swap).split("=");
    const target = path.resolve(SRC, from);
    const replacement = path.resolve(REPO, to);
    plugins.push(
      new webpack.NormalModuleReplacementPlugin(/.*/, (resource: ResolveData) => {
        const asked = path.resolve(resource.context || "", resource.request || "");
        if (asked === target || asked + ".ts" === target) resource.request = replacement;
      })
    );
  }
  const out = env.out ? path.resolve(REPO, String(env.out)) : path.join(REPO, "matrix_web_3d_rain", "dist", "bundle.js");
  return {
    mode: "production",
    context: HERE,
    entry: "./src/index.ts",
    target: ["web", "es2022"],
    output: { path: path.dirname(out), filename: path.basename(out), publicPath: "", iife: true },
    devtool: env.coverage ? "source-map" : false,
    resolve: { extensions: [".ts", ".js"] },
    module: {
      rules: [
        { test: /\.ts$/, loader: "ts-loader", options: { transpileOnly: true, configFile: path.join(HERE, "tsconfig.json"), ...(env.coverage ? { compilerOptions: { sourceMap: true } } : {}) } },
        { test: /\.(glsl|wgsl)$/, loader: path.join(HERE, "tools", "text-loader.ts") },
      ],
    },
    optimization: {
      minimize: !env.coverage,
      concatenateModules: !env.coverage,
      // (class names kept: the tests' frame costs are read by an effect's class name)
      minimizer: [new TerserPlugin({ extractComments: false, terserOptions: { keep_classnames: true, format: { comments: false } } })],
    },
    performance: { hints: false },
    plugins,
  };
};
