/**
 * Reading `.quick-utils.json` off whatever file system the workspace is on.
 *
 * Separated from `presets.ts` so the parsing and the store stay testable
 * without a file system: everything `vscode` is needed for lives here, and it
 * is only `workspace.fs` plus the folder list. `workspace.fs` rather than
 * `node:fs` on purpose — the same code then works in a remote workspace, in a
 * virtual one, and in the browser, where `node:fs` does not exist at all.
 */

import * as vscode from 'vscode';

import { PRESET_FILE, parsePresets, type PresetStore } from './presets';
import type { Logger } from '@kkdev92/vscode-ext-kit';

/**
 * Loads the preset file from the first workspace folder into the store.
 *
 * A missing file is not a failure — most workspaces will not have one — so it
 * clears the store rather than reporting. Anything else that goes wrong reading
 * the file is reported the same way a parse failure is: the store keeps what it
 * had, and the issue is available for a command to show.
 *
 * @example
 * ```ts
 * const reload = () => loadPresets(store, logger);
 * module.fileWatchers.add({ patterns: `**\/${PRESET_FILE}`, handle: () => reload() });
 * ```
 */
export async function loadPresets(store: PresetStore, logger: Logger): Promise<void> {
  // Presets are the one thing here that reads a workspace file without being
  // asked to — a hosted service loads them at activation and a watcher reloads
  // them. In an untrusted window that is content from a repository the user has
  // told VS Code they do not trust, so it is not read at all. This extension
  // declares `untrustedWorkspaces.supported`, and it can only keep saying so
  // because of this check.
  if (!vscode.workspace.isTrusted) {
    store.clear();
    return;
  }

  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder === undefined) {
    store.clear();
    return;
  }

  const uri = vscode.Uri.joinPath(folder.uri, PRESET_FILE);
  let text: string;
  try {
    text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    // Overwhelmingly "there is no such file", which is the normal state of a
    // workspace that does not use presets. A permissions error looks the same
    // from here, and reporting every folder without the file would be noise.
    store.clear();
    return;
  }

  const outcome = parsePresets(text);
  store.apply(uri.toString(), outcome);
  if (outcome.ok) {
    logger.debug('presets loaded', { count: outcome.value.length });
  } else {
    logger.warn('preset file could not be read', { issues: outcome.error });
  }
}
