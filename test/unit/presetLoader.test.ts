/**
 * What the preset loader is willing to read.
 *
 * The parsing lives in `presets.test.ts`; this is only about the decision to
 * open the file at all. That decision is a trust boundary: presets are the one
 * thing this extension reads without being asked to — a hosted service loads
 * them at activation and a watcher reloads them — so in a window the user has
 * told VS Code they do not trust, the file is content from a repository that
 * has not earned a read. The manifest says as much under
 * `capabilities.untrustedWorkspaces`, and that claim is only true because of
 * the check this suite pins.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const readFile = vi.fn();

vi.mock('vscode', () => ({
  workspace: {
    get isTrusted(): boolean {
      return state.trusted;
    },
    get workspaceFolders(): readonly { uri: { path: string } }[] | undefined {
      return state.folders;
    },
    fs: { readFile },
  },
  Uri: {
    joinPath: (base: { path: string }, ...parts: string[]) => ({
      path: [base.path, ...parts].join('/'),
      toString: () => [base.path, ...parts].join('/'),
    }),
  },
}));

const state: {
  trusted: boolean;
  folders: readonly { uri: { path: string } }[] | undefined;
} = { trusted: true, folders: [{ uri: { path: '/repo' } }] };

const { loadPresets } = await import('../../src/features/presetLoader');
const { PresetStore } = await import('../../src/features/presets');
const logger = { debug: vi.fn(), warn: vi.fn() } as unknown as Parameters<typeof loadPresets>[1];

const encode = (value: unknown): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(value));

describe('loadPresets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.trusted = true;
    state.folders = [{ uri: { path: '/repo' } }];
  });

  it('reads the file in a trusted workspace', async () => {
    readFile.mockResolvedValue(encode({ snippets: [{ name: 'header', body: '// (c)' }] }));
    const store = new PresetStore();

    await loadPresets(store, logger);

    expect(readFile).toHaveBeenCalledTimes(1);
    expect(store.presets.map((preset) => preset.name)).toEqual(['header']);
  });

  it('does not read the file at all in an untrusted workspace', async () => {
    state.trusted = false;
    readFile.mockResolvedValue(encode({ snippets: [{ name: 'header', body: '// (c)' }] }));
    const store = new PresetStore();

    await loadPresets(store, logger);

    // Not "read it and discard it" — the read never happens. A file the user
    // has not trusted is not parsed, not held, and not reported on.
    expect(readFile).not.toHaveBeenCalled();
    expect(store.presets).toEqual([]);
    expect(store.issues).toEqual([]);
    expect(store.loadedFrom).toBeUndefined();
  });

  it('drops presets already in effect when trust is revoked', async () => {
    readFile.mockResolvedValue(encode({ snippets: [{ name: 'header', body: '// (c)' }] }));
    const store = new PresetStore();
    await loadPresets(store, logger);
    expect(store.presets).toHaveLength(1);

    state.trusted = false;
    await loadPresets(store, logger);

    expect(store.presets).toEqual([]);
  });
});
