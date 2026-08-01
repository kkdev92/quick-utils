/**
 * Activation, against the built bundle.
 *
 * Loads `dist/extension.js` with `vscode` replaced by the kit's mock and runs
 * `activate()` for real. That covers the wiring nothing else can: that every
 * declared command is registered, that the views and status items are created,
 * and that the config schema agrees with the manifest at runtime rather than
 * only in a manifest-shaped assertion.
 *
 * The mock is imported from `@kkdev92/vscode-ext-kit/testing/vitest` — the very
 * module the kit's Vitest config aliases `vscode` to — so assertions here
 * observe the same instance the code under test sees. The bundle itself is CJS
 * loaded through Node's own resolver (`createRequire`), which the Vite alias
 * does not reach, so `Module._load` is patched to serve the same mock there.
 *
 * Requires `npm run bundle`.
 */

import { existsSync, readFileSync } from 'node:fs';
import Module from 'node:module';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMockExtensionContext } from '@kkdev92/vscode-ext-kit/testing';
import vscodeMock from '@kkdev92/vscode-ext-kit/testing/vitest';

import { COMMANDS } from '../../src/core/constants';

const bundlePath = join(__dirname, '../../dist/extension.js');
const require = createRequire(import.meta.url);

interface ExtensionModule {
  activate(context: unknown): void;
  deactivate(): void;
}

/** `Module._load` is not in @types/node's public surface. */
type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
interface LoadableModule {
  _load: ModuleLoader;
}

let extension: ExtensionModule;
let context: ReturnType<typeof createMockExtensionContext>;
let restore: (() => void) | undefined;

/** Registered command ids, in registration order. */
function registeredCommands(): string[] {
  const calls = [
    ...vscodeMock.commands.registerCommand.mock.calls,
    ...vscodeMock.commands.registerTextEditorCommand.mock.calls,
  ];
  return calls.map((call) => String(call[0]));
}

beforeAll(() => {
  if (!existsSync(bundlePath)) {
    throw new Error(`${bundlePath} is missing. Run \`npm run bundle\` first.`);
  }

  const loadable = Module as unknown as LoadableModule;
  const original = loadable._load;
  loadable._load = (request, parent, isMain) =>
    request === 'vscode' ? vscodeMock : original(request, parent, isMain);
  restore = () => {
    loadable._load = original;
  };

  extension = require(bundlePath) as ExtensionModule;

  context = createMockExtensionContext(vi);
  // The real manifest, so `checkPackageJsonSync` compares the config schema
  // against what ships rather than against an empty object.
  (context.extension as { packageJSON: unknown }).packageJSON = JSON.parse(
    readFileSync(join(__dirname, '../../package.json'), 'utf8')
  );

  extension.activate(context);
});

afterAll(() => {
  extension.deactivate();
  for (const subscription of context.subscriptions) {
    subscription.dispose();
  }
  restore?.();
});

describe('activate', () => {
  it('exports the extension host entry points', () => {
    expect(typeof extension.activate).toBe('function');
    expect(typeof extension.deactivate).toBe('function');
  });

  it('registers every declared command exactly once', () => {
    const registered = registeredCommands();
    for (const command of Object.values(COMMANDS)) {
      expect(registered).toContain(command);
    }
    expect(new Set(registered).size).toBe(registered.length);
  });

  it('registers no command that is not declared', () => {
    const declared = new Set<string>(Object.values(COMMANDS));
    for (const command of registeredCommands()) {
      expect(declared).toContain(command);
    }
  });

  it('registers the editor-scoped commands as text editor commands', () => {
    const asTextEditor = new Set(
      vscodeMock.commands.registerTextEditorCommand.mock.calls.map((call) => String(call[0]))
    );
    // These need an editor, and VS Code should grey them out without one.
    expect(asTextEditor).toContain(COMMANDS.UPPER_CASE);
    expect(asTextEditor).toContain(COMMANDS.JSON_FORMAT);
    expect(asTextEditor).toContain(COMMANDS.HASH);
    // These do not.
    expect(asTextEditor).not.toContain(COMMANDS.OPEN_REGEX_TESTER);
    expect(asTextEditor).not.toContain(COMMANDS.MANAGE_SECRETS);
  });

  it('creates both tree views', () => {
    // Order is not a contract — the sidebar order comes from the manifest.
    const views = vscodeMock.window.createTreeView.mock.calls.map((call) => String(call[0])).sort();
    expect(views).toEqual(['quickUtils.history', 'quickUtils.tools']);
  });

  it('creates the status bar item and the JSON language status item', () => {
    expect(vscodeMock.window.createStatusBarItem.mock.calls.length).toBeGreaterThan(0);
    expect(vscodeMock.languages.createLanguageStatusItem.mock.calls.length).toBeGreaterThan(0);
  });

  it('registers the webview serializer, without which the panel cannot be restored', () => {
    const viewTypes = vscodeMock.window.registerWebviewPanelSerializer.mock.calls.map((call) =>
      String(call[0])
    );
    expect(viewTypes).toContain('quickUtils.regexTester');
  });

  it('opens the main channel as a LogOutputChannel and the diagnostics one as plain', () => {
    const calls = vscodeMock.window.createOutputChannel.mock.calls;
    expect(calls.map((call) => String(call[0]))).toEqual([
      'Quick Utils',
      'Quick Utils (diagnostics)',
    ]);

    // The main channel gets `{ log: true }`, so the Output panel's level
    // selector applies to it. The diagnostics channel deliberately does not:
    // "send me the logs" must not be filtered by a setting the user forgot.
    expect(calls[0]?.[1]).toMatchObject({ log: true });
    expect(calls[1]?.[1]).toBeUndefined();
  });

  it('registers its disposables with the extension context', () => {
    expect(context.subscriptions.length).toBeGreaterThan(0);
  });

  it('ships the worker bundle activation will later need', () => {
    // The regex worker is lazy — activation must not pay for a thread nobody
    // asked for — so the only thing to check here is that the file it will
    // eventually spawn was built alongside the extension.
    expect(existsSync(join(__dirname, '../../dist/regex-worker.js'))).toBe(true);
  });
});

describe('the bundle', () => {
  const source = readFileSync(bundlePath, 'utf8');

  it('does not inline the vscode module', () => {
    expect(source).toMatch(/require\((["'])vscode\1\)/);
  });

  it('requires no networking module', () => {
    for (const name of ['http', 'https', 'net', 'tls', 'dns']) {
      expect(source).not.toMatch(new RegExp(`require\\((["'])(?:node:)?${name}\\1\\)`));
    }
  });

  it('carries the resolved kit version rather than the semver range', () => {
    // The kit's `exports` map does not list `./package.json`, so requiring it
    // directly throws; read the installed manifest from disk instead.
    const kitVersion = (
      JSON.parse(
        readFileSync(
          join(__dirname, '../../node_modules/@kkdev92/vscode-ext-kit/package.json'),
          'utf8'
        )
      ) as { version: string }
    ).version;
    expect(source).toContain(kitVersion);
  });
});
