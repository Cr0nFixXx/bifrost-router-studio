/**
 * esbuild bundle for the VSCode extension.
 *
 * Two bundles: the extension host entry and (from phase 2) the language server,
 * both CommonJS because VSCode loads extensions with `require`. The repo root is
 * `"type": "module"`, which is why this extension's package.json deliberately
 * carries no `"type"` field — otherwise these .js outputs would be read as ESM.
 *
 * Two resolver shims let us import the app's own modules in `../../src` unchanged:
 *   - `@/…` is the app's path alias, declared only in tsconfig/vite/vitest.
 *     Handled by esbuild's `alias` option below.
 *   - `…?url` is a Vite asset import. esbuild does not know the suffix and would
 *     fail on `src/lib/sqljs/loader.ts`, which every SQLite read goes through.
 *     In Vite it yields a web URL; here the plugin copies the asset next to the
 *     bundle and hands back a runtime `__dirname` path, which is what sql.js
 *     `locateFile` needs in Node.
 */
import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const srcRoot = path.join(repoRoot, 'src');
const outdir = path.join(here, 'out');

/**
 * Turn `import x from 'pkg/file.wasm?url'` into a module exporting the path of
 * that file — but NOT this machine's absolute path. esbuild would bake it into
 * the bundle and the VSIX would ENOENT everywhere else. Copy the asset next to
 * the bundle and resolve it from `__dirname` at runtime (real, because cjs).
 */
const assetUrlPlugin = {
  name: 'asset-url',
  setup(build) {
    build.onResolve({ filter: /\?url$/ }, (args) => {
      const spec = args.path.replace(/\?url$/, '');
      // `require.resolve` follows the package's `exports` map; a hand-built
      // node_modules path does not.
      const resolved = spec.startsWith('.')
        ? path.resolve(args.resolveDir, spec)
        : require_.resolve(spec, { paths: [args.resolveDir, repoRoot] });
      return { path: resolved, namespace: 'asset-url' };
    });

    build.onLoad({ filter: /.*/, namespace: 'asset-url' }, (args) => {
      const file = path.basename(args.path);
      fs.mkdirSync(outdir, { recursive: true });
      fs.copyFileSync(args.path, path.join(outdir, file));
      return {
        contents: `export default require("node:path").join(__dirname, ${JSON.stringify(file)});`,
        loader: 'js',
      };
    });
  },
};

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: { extension: path.join(here, 'src/extension.ts') },
  outdir,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // `vscode` is provided by the host at runtime and must never be bundled.
  external: ['vscode'],
  // The app's path alias. esbuild's own `alias` keeps its extension resolution
  // (.ts, index files); an onResolve hook would have to redo all of that.
  alias: { '@': srcRoot },
  sourcemap: true,
  logLevel: 'info',
  plugins: [assetUrlPlugin],
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('watching…');
} else {
  await esbuild.build(options);
}
