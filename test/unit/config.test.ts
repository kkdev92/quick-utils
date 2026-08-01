/**
 * The config schema, against the real manifest.
 *
 * `test/unit/manifest.test.ts` compares the manifest with the key *constants*;
 * this compares it with the *schema* the extension actually reads through, using
 * the kit's own `checkPackageJsonSync`. The two catch different mistakes: a key
 * can be in `CONFIG` and the manifest yet never declared as a field.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createMockExtensionContext } from '@kkdev92/vscode-ext-kit/testing';

import { config } from '../../src/core/config';

function contextWithRealManifest(): ReturnType<typeof createMockExtensionContext> {
  const context = createMockExtensionContext(vi);
  (context.extension as { packageJSON: unknown }).packageJSON = JSON.parse(
    readFileSync(join(__dirname, '../../package.json'), 'utf8')
  );
  return context;
}

describe('config schema', () => {
  it('declares nothing that package.json is missing', () => {
    expect(config.checkPackageJsonSync(contextWithRealManifest())).toEqual([]);
  });

  it('never throws on a context with no packageJSON', () => {
    // Documented behaviour of checkPackageJsonSync, and the reason activate()
    // can call it unconditionally.
    const context = createMockExtensionContext(vi);
    (context.extension as { packageJSON: unknown }).packageJSON = undefined;
    expect(() => config.checkPackageJsonSync(context)).not.toThrow();
  });
});
