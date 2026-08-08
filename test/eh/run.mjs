// Launches a real VS Code with this extension loaded and runs test/eh/index.ts
// inside it.
//
// `--extensionDevelopmentPath` points at the repo, so the host loads exactly
// the `dist/extension.js` that `npm run package` puts in the VSIX — the same
// bundle, not a re-compilation.
//
// The VS Code build is cached under `.vscode-test/`; set VSCODE_TEST_CACHE to
// share one with another checkout instead of downloading a second copy.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import * as esbuild from 'esbuild';
import { runTests } from '@vscode/test-electron';

const here = import.meta.dirname;
const repoRoot = resolve(here, '../..');
const testsPath = resolve(repoRoot, 'out/eh/index.js');

// Bundled here rather than by `scripts/build.mjs`: this is test code, and
// anything under `dist/` ships in the VSIX. `out/` is gitignored and
// .vscodeignore'd.
await esbuild.build({
  entryPoints: [resolve(here, 'index.ts')],
  outfile: testsPath,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'warning',
});

const scratch = mkdtempSync(join(tmpdir(), 'quick-utils-eh-'));
const version = process.env['VSCODE_VERSION'] ?? 'stable';
const cachePath = process.env['VSCODE_TEST_CACHE'];
// `--demo` paces the run so a person can watch it, and leaves the window
// rendering. The cases themselves are unchanged — a demo that ran different
// code would not be showing you anything.
const demo = process.argv.includes('--demo');

try {
  await runTests({
    version,
    ...(cachePath === undefined ? {} : { cachePath }),
    extensionDevelopmentPath: repoRoot,
    extensionTestsPath: testsPath,
    launchArgs: [
      join(scratch, 'workspace'),
      // Only this extension, in a trusted folder: anything else in the host
      // could register a clashing command id and turn a pass into a mystery.
      '--disable-extensions',
      '--disable-workspace-trust',
      // GPU off keeps CI headless-friendly and quiet. In demo mode the whole
      // point is to look at the window, so it stays on.
      ...(demo ? [] : ['--disable-gpu', '--no-sandbox']),
      `--user-data-dir=${join(scratch, 'user-data')}`,
    ],
    extensionTestsEnv: {
      QU_EH_DEMO: demo ? '1' : '0',
      QU_EH_PACE: process.env['QU_EH_PACE'] ?? '1',
    },
  });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
