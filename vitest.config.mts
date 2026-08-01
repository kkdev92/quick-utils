import { defineConfig, mergeConfig } from 'vitest/config';
import { vscodeExtKitVitestConfig } from '@kkdev92/vscode-ext-kit/testing/vitest-config';

/**
 * `vscode` has no npm package — it is injected by the extension host — so both
 * projects merge in the kit's own Vitest config, which aliases `vscode` to
 * `@kkdev92/vscode-ext-kit/testing/vitest` (the mock, re-exported as the named
 * exports `import * as vscode` reads) and inlines the kit so its own `vscode`
 * imports go through the alias too.
 *
 * Merged per project rather than at the root: project configs resolve their
 * own `resolve.alias`, so a root-level merge would not reach them.
 */
export default defineConfig({
  test: {
    projects: [
      mergeConfig(
        vscodeExtKitVitestConfig,
        defineConfig({
          // Fast tests against src/. Everything under src/lib and src/core is
          // free of `vscode` imports by design, so most of these need no mock
          // at all.
          test: {
            name: 'unit',
            environment: 'node',
            include: ['test/unit/**/*.test.ts'],
          },
        })
      ),
      mergeConfig(
        vscodeExtKitVitestConfig,
        defineConfig({
          // Tests against the built bundles: the packaged regex worker runs
          // real patterns in a real worker thread, and dist/extension.js is
          // activated against the same mock. `npm run test:integration`
          // builds first.
          test: {
            name: 'integration',
            environment: 'node',
            include: ['test/integration/**/*.test.ts'],
            testTimeout: 30_000,
            hookTimeout: 30_000,
          },
        })
      ),
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        // Wiring over vscode + the kit, with no logic of its own. Exercised by
        // test/integration/extension.test.ts, which activates the real bundle.
        'src/extension.ts',
        'src/core/config.ts',
        // Build-time substitution; nothing to exercise.
        'src/core/build.ts',
        // Type and schema declarations only.
        'src/core/types.ts',
        'src/regex/protocol.ts',
        'src/webview/protocol.ts',
        // The worker entry and the host side of the worker need a real worker
        // thread; covered by test/integration/regexWorker.test.ts.
        'src/regex/worker.ts',
        'src/regex/client.ts',
        // Adapters between src/lib and the kit's UI primitives: what is worth
        // asserting there is the dialog flow, which the integration activation
        // test covers end to end.
        'src/features/**',
        // Webview page scripts run in a browser context the unit suite does
        // not have; their host-facing contract is covered via the schemas and
        // the packaged-worker tests.
        'src/webview/**',
      ],
      thresholds: {
        lines: 95,
        branches: 90,
        functions: 95,
        statements: 95,
      },
    },
  },
});
