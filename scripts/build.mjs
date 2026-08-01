/**
 * Bundling.
 *
 * Four entry points across two platforms:
 *
 * - `dist/extension.js` (node) — the extension host bundle.
 * - `dist/regex-worker.js` (node) — the regex worker has to be a file Node can
 *   hand to `new Worker()`. It shares no runtime state with the host, so a
 *   separate bundle costs only the duplicated matcher (a few hundred bytes)
 *   and keeps the worker free of any accidental `vscode` reference.
 * - `dist/webview/regex-tester.js` and `dist/webview/scratchpad.js` (browser) —
 *   the page scripts, written in TypeScript against the same RPC schemas as
 *   the host and bundled with the kit's `webview-client`/`timing` subpaths.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * The exact kit version this bundle was built against, baked in so the state
 * report can name it — `package.json` only records the semver range. The kit
 * exports `./package.json` since 2.1.0, so the direct require works.
 */
const kitVersion = require('@kkdev92/vscode-ext-kit/package.json').version;

/** @type {esbuild.BuildOptions} */
const shared = {
  bundle: true,
  platform: 'node',
  // VS Code 1.101 is the first release whose extension host runs Node 22.
  target: 'node22',
  format: 'cjs',
  sourcemap: !production,
  minify: production,
  treeShaking: true,
  // Provided by the extension host at runtime.
  external: ['vscode'],
  define: {
    __KIT_VERSION__: JSON.stringify(kitVersion),
  },
  logLevel: 'info',
};

/** @type {esbuild.BuildOptions} */
const webviewShared = {
  bundle: true,
  platform: 'browser',
  // Webviews in a 1.125+ host run a current Chromium.
  target: 'es2022',
  format: 'iife',
  sourcemap: !production,
  minify: production,
  treeShaking: true,
  logLevel: 'info',
};

const builds = [
  {
    ...shared,
    entryPoints: [join(root, 'src/extension.ts')],
    outfile: join(outDir, 'extension.js'),
  },
  {
    ...shared,
    entryPoints: [join(root, 'src/regex/worker.ts')],
    outfile: join(outDir, 'regex-worker.js'),
  },
  {
    ...webviewShared,
    entryPoints: [join(root, 'src/webview/regex-tester.ts')],
    outfile: join(outDir, 'webview/regex-tester.js'),
  },
  {
    ...webviewShared,
    entryPoints: [join(root, 'src/webview/scratchpad.ts')],
    outfile: join(outDir, 'webview/scratchpad.js'),
  },
];

if (watch) {
  for (const options of builds) {
    const context = await esbuild.context(options);
    await context.watch();
  }
  console.log('Watching for changes...');
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
