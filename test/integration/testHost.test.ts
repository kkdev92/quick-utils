/**
 * The production plan, on fakes.
 *
 * The other integration suite loads the built bundle and activates it against a
 * mock of the `vscode` module — it proves the packaged artefact works. This one
 * is a level up: `createTestHost` takes the very module `extension.ts` ships and
 * binds it to the framework's fakes, with no `vscode` involved at all.
 *
 * What that buys, and why both exist:
 *
 * - **There is no second definition.** A test that declared its own commands
 *   and services would pass while the real one was broken. The import below is
 *   the same object the extension host gets.
 * - **The fakes are drivable.** `host.settings`, `host.storage`,
 *   `host.quickInput` and the rest are inputs, so a scenario can be set up
 *   ("nothing stored, the user picks the second item") without a workspace.
 * - **Leaks are checked.** `host.leaks()` reports registrations and resources
 *   still held after `stop()`, which is the one assertion no unit test can make
 *   and no manual pass would notice.
 */

import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestHost, type TestHost } from '@kkdev92/vscode-ext-kit/testing';

import { COMMANDS, VIEWS } from '../../src/core/constants';
import { plan } from '../../src/extension';

/** A fresh host per test, over the one plan the extension actually ships. */
function createHost(): TestHost {
  return createTestHost({ plan });
}

describe('the application, run on fakes', () => {
  let host: TestHost;

  beforeEach(() => {
    host = createHost();
  });

  it('compiled: no duplicate ids, no missing or circular dependencies', () => {
    // Static preflight runs while `extension.ts` is evaluated, so importing the
    // plan at the top of this file is the assertion — a duplicate command id or
    // a service depending on itself throws there. Stated out loud because it is
    // the whole of the preflight guarantee and it is easy to read past.
    expect(plan.commands.length + plan.textEditorCommands.length).toBe(
      Object.keys(COMMANDS).length
    );
  });

  it('registers every declared command when it starts', async () => {
    await host.start();

    const registered = new Set(host.commands.registeredIds);
    const missing = Object.values(COMMANDS).filter((id) => !registered.has(id));

    expect(missing).toEqual([]);
    await host.stop();
  });

  it('creates its declared views and status items at activation', async () => {
    await host.start();

    // Declared UI is built eagerly rather than on first injection, so it is
    // there before any command runs.
    expect(host.treeViews.views.map((view) => view.id)).toEqual(
      expect.arrayContaining([VIEWS.HISTORY, VIEWS.TOOLS])
    );
    expect(host.webviews.views.map((view) => view.id)).toContain(VIEWS.SCRATCHPAD);
    expect(host.statusBar.items).not.toHaveLength(0);
    expect(host.languageStatus.items).not.toHaveLength(0);

    await host.stop();
  });

  it('watches the workspace preset file', async () => {
    await host.start();

    // The glob is declared, so the watcher exists from activation rather than
    // from whenever something first asks for presets.
    expect(host.fileWatchers._watchedPatterns()).toContain('**/.quick-utils.json');

    await host.stop();
  });

  it('reads the preset file only once trust arrives', async () => {
    // The extension declares `untrustedWorkspaces.supported`, so it keeps
    // running in an untrusted window — and because its own enablement never
    // changes, VS Code does not restart the extension host on its account. It
    // is re-activated only if some other installed extension happens to flip.
    // Without listening for the grant, whatever was declined stays unread.
    const workspace = vscode.workspace as unknown as {
      isTrusted: boolean;
      workspaceFolders: unknown;
      fs: { readFile: ReturnType<typeof vi.fn> };
      onDidGrantWorkspaceTrust: ReturnType<typeof vi.fn>;
    };
    const previous = {
      trusted: workspace.isTrusted,
      folders: workspace.workspaceFolders,
    };
    workspace.isTrusted = false;
    workspace.workspaceFolders = [{ uri: vscode.Uri.file('/repo'), name: 'repo', index: 0 }];
    workspace.fs.readFile.mockResolvedValue(
      new TextEncoder().encode(JSON.stringify({ snippets: [{ name: 'header', body: '// (c)' }] }))
    );
    workspace.fs.readFile.mockClear();
    workspace.onDidGrantWorkspaceTrust.mockClear();

    try {
      await host.start();
      expect(workspace.fs.readFile).not.toHaveBeenCalled();

      const [listener] = workspace.onDidGrantWorkspaceTrust.mock.calls[0] ?? [];
      expect(listener).toBeTypeOf('function');

      workspace.isTrusted = true;
      (listener as () => void)();
      await vi.waitFor(() => {
        expect(workspace.fs.readFile).toHaveBeenCalled();
      });

      await host.stop();
    } finally {
      workspace.isTrusted = previous.trusted;
      workspace.workspaceFolders = previous.folders;
    }
  });

  it('runs a command through the real handler', async () => {
    await host.start();

    // Nothing is in history, so this is the empty-state path — chosen because
    // it needs no editor, and it still goes through command binding, the
    // operation executor and the injected services.
    await host.commands.execute(COMMANDS.HISTORY_CLEAR);

    expect(host.diagnostics.map((entry) => entry.event)).toContain('operation.completed');
    await host.stop();
  });

  it('holds nothing after it stops', async () => {
    await host.start();
    await host.commands.execute(COMMANDS.HISTORY_CLEAR);
    await host.stop();

    // The single-cleanup-owner rule, as a number: every registration and every
    // resource the application took is released by `stop()`, including the ones
    // a command's operation created while running, and no command is left
    // answering after the host has gone.
    expect(host.leaks()).toEqual({ registrations: 0, resources: 0, commands: [] });
  });

  it('starts and stops without logging an error', async () => {
    await host.start();
    await host.stop();

    expect(host.logs.at('error')).toEqual([]);
  });

  // `quickUtils.logLevel` was declared, documented and localised for a while
  // with nothing reading it, so this pair is about the wiring rather than the
  // comparison — `HistoryStore` takes its logger from the injected token, and
  // that is the seam where a filter is easy to forget.
  it('logs at info by default', async () => {
    await host.start();
    host.notifications._respondWith(0); // confirm the clear, which is what logs
    await host.commands.execute(COMMANDS.HISTORY_CLEAR);

    expect(host.logs.at('info').map((entry) => entry.message)).toContain('History cleared');
    await host.stop();
  });

  it('drops an info entry once logLevel is raised to warn', async () => {
    host.settings._set('quickUtils', 'logLevel', 'globalValue', 'warn');
    await host.start();
    host.notifications._respondWith(0);
    await host.commands.execute(COMMANDS.HISTORY_CLEAR);

    expect(host.logs.at('info').map((entry) => entry.message)).not.toContain('History cleared');
    await host.stop();
  });
});
