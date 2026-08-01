/**
 * Values baked in at bundle time.
 *
 * `scripts/build.mjs` substitutes these through esbuild's `define`, so the
 * state report can name the exact kit version a build was compiled against
 * rather than the semver range from `package.json`. The `typeof` guard keeps
 * the module importable from the unit tests, which run against `src/` with no
 * substitution applied.
 */

declare const __KIT_VERSION__: string;

/** Resolved `@kkdev92/vscode-ext-kit` version this bundle was built against. */
export const KIT_VERSION: string =
  typeof __KIT_VERSION__ === 'string' ? __KIT_VERSION__ : 'unknown (unbundled)';
