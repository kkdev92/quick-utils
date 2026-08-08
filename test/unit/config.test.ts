/**
 * The config schema, against the real manifest.
 *
 * `test/unit/manifest.test.ts` compares the manifest with the key *constants*;
 * this compares it with the *declaration* the extension actually reads through.
 * The two catch different mistakes: a key can be in `CONFIG` and the manifest
 * yet never declared as a setting.
 *
 * v2 got this from the kit's `checkPackageJsonSync`. v3 drops it — package.json
 * is the manifest's source of truth, and a framework that reads it back to
 * check itself was doing the same work twice. The check is worth keeping, so it
 * lives here, where the manifest and the declaration both are.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { EXTENSION_ID } from '../../src/core/constants';
import { Settings } from '../../src/core/config';

interface Manifest {
  readonly contributes?: {
    readonly configuration?: {
      readonly properties?: Readonly<Record<string, unknown>>;
    };
  };
}

function manifest(): Manifest {
  return JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as Manifest;
}

/** Fully-qualified keys the manifest declares under this extension's section. */
function contributed(): readonly string[] {
  const properties = manifest().contributes?.configuration?.properties ?? {};
  return Object.keys(properties).filter((key) => key.startsWith(`${EXTENSION_ID}.`));
}

/** Fully-qualified keys the settings declaration reads through. */
function declared(): readonly string[] {
  return Object.keys(Settings.values).map((key) => `${Settings.section}.${key}`);
}

describe('config schema', () => {
  it('declares nothing that package.json is missing', () => {
    expect(declared().filter((key) => !contributed().includes(key))).toEqual([]);
  });

  it('reads every setting package.json contributes', () => {
    // The other direction: a key the user can set but the extension never
    // reads is a setting that silently does nothing.
    expect(contributed().filter((key) => !declared().includes(key))).toEqual([]);
  });
});
