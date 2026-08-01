/**
 * The Scratchpad: a sidebar panel for converting text you are *not* editing.
 *
 * Half of what this extension does gets used on something that is not in the
 * document — a value from a log, a token from a browser, a line from a chat.
 * Doing that today means pasting it into a file, transforming, copying, and
 * undoing. The scratchpad removes that round trip.
 *
 * The markup is generated rather than loaded from a template, because the body
 * is mostly the transform list, and that list comes from the registry.
 */

import * as vscode from 'vscode';
import {
  createWebviewHtml,
  escapeHtml,
  generateCSP,
  generateNonce,
  l10n,
  registerWebviewView,
  type Logger,
  type ManagedWebviewView,
} from '@kkdev92/vscode-ext-kit';

import { VIEWS } from '../core/constants';
import type { TransformRegistry } from '../core/transforms';
import type { TransformKind } from '../core/types';
// The RPC contract lives in a vscode-free module so the page script bundle is
// typed against the exact same interfaces — see src/webview/protocol.ts.
import type { ScratchpadSchema } from '../webview/protocol';

/** Group headings in the transform dropdown, in display order. */
const GROUP_LABELS: Record<TransformKind, string> = {
  case: 'Change Case',
  codec: 'Encode / Decode',
  lines: 'Lines',
  json: 'JSON',
};

const GROUP_ORDER: readonly TransformKind[] = ['case', 'codec', 'lines', 'json'];

/** Collaborators the scratchpad needs. */
export interface ScratchpadContext {
  context: vscode.ExtensionContext;
  logger: Logger;
  registry: TransformRegistry;
}

/**
 * Registers the sidebar view.
 *
 * `onResolve` runs again whenever VS Code recreates the view, so everything
 * per-instance — the HTML and the request handlers — is set up inside it.
 */
export function registerScratchpad(context: ScratchpadContext): vscode.Disposable {
  return registerWebviewView<ScratchpadSchema>(
    context.context,
    VIEWS.SCRATCHPAD,
    (view) => {
      view.setHtml(buildHtml(context, view));

      view.rpc.onRequest('transform', ({ id, input }) => {
        const transform = context.registry.get(id);
        if (transform === undefined) {
          return { output: '', error: l10n.t('Unknown transform.') };
        }
        try {
          return { output: transform.apply(input) };
        } catch (error) {
          return { output: '', error: error instanceof Error ? error.message : String(error) };
        }
      });

      view.rpc.onRequest('copy', async ({ text }) => {
        await vscode.env.clipboard.writeText(text);
        return null;
      });

      view.rpc.onRequest('insert', async ({ text }) => {
        const editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
          return {
            inserted: false,
            message: l10n.t('Open a file first — there is no active editor.'),
          };
        }
        const inserted = await editor.edit((builder) => {
          builder.replace(editor.selection, text);
        });
        return inserted
          ? { inserted }
          : {
              inserted,
              message: l10n.t('The editor rejected the edit. The file may be read-only.'),
            };
      });

      context.logger.debug('Scratchpad view resolved');
    },
    { enableScripts: true }
  );
}

/**
 * Builds the view's HTML.
 *
 * Every interpolated value goes through `escapeHtml`: transform labels are
 * localised strings, and a translation containing an apostrophe or an angle
 * bracket must not be able to change the markup around it.
 */
function buildHtml(
  context: ScratchpadContext,
  view: ManagedWebviewView<ScratchpadSchema>
): string {
  const webview = view.native.webview;
  const nonce = generateNonce();
  const media = vscode.Uri.joinPath(context.context.extensionUri, 'media', 'webview');
  const bundles = vscode.Uri.joinPath(context.context.extensionUri, 'dist', 'webview');

  const options = GROUP_ORDER.flatMap((kind) => {
    const inGroup = context.registry.all.filter((transform) => transform.kind === kind);
    if (inGroup.length === 0) {
      return [];
    }
    return [
      `<optgroup label="${escapeHtml(l10n.t(GROUP_LABELS[kind]))}">`,
      ...inGroup.map(
        (transform) =>
          `<option value="${escapeHtml(transform.id)}">${escapeHtml(l10n.t(transform.label))}</option>`
      ),
      '</optgroup>',
    ];
  }).join('\n');

  const body = `
    <label class="label" for="transform">${escapeHtml(l10n.t('Transform'))}</label>
    <select id="transform">
${options}
    </select>

    <label class="label" for="input">${escapeHtml(l10n.t('Input'))}</label>
    <textarea id="input" rows="5" spellcheck="false"></textarea>

    <label class="label" for="output">${escapeHtml(l10n.t('Output'))}</label>
    <textarea id="output" rows="5" spellcheck="false" readonly></textarea>

    <p id="status" class="status" role="status" aria-live="polite"></p>

    <div class="actions">
      <button id="copy" type="button">${escapeHtml(l10n.t('Copy'))}</button>
      <button id="insert" type="button" class="secondary">${escapeHtml(l10n.t('Insert at cursor'))}</button>
      <button id="swap" type="button" class="secondary">${escapeHtml(l10n.t('Output → Input'))}</button>
    </div>
  `;

  return createWebviewHtml({
    title: l10n.t('Scratchpad'),
    csp: generateCSP(webview, { nonce }),
    styles: [webview.asWebviewUri(vscode.Uri.joinPath(media, 'scratchpad.css')).toString()],
    // Bundled from src/webview/scratchpad.ts; the kit's RPC client is inside.
    scripts: [webview.asWebviewUri(vscode.Uri.joinPath(bundles, 'scratchpad.js')).toString()],
    nonce,
    body,
  });
}
