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
  type EditorService,
  type LocalizationService,
  type Logger,
  type ManagedWebview,
} from '@kkdev92/vscode-ext-kit';

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
  logger: Logger;
  registry: TransformRegistry;
  l10n: LocalizationService;
  editors: EditorService;
}

/**
 * Fills the sidebar view in.
 *
 * Runs again whenever VS Code recreates the view, so everything per-instance —
 * the HTML and the request handlers — is set up here rather than once at
 * activation. The registration itself is declared by the module.
 */
export function resolveScratchpad(
  context: ScratchpadContext,
  view: ManagedWebview<ScratchpadSchema>
): void {
  view.setHtml(buildHtml(context, view));

  view.rpc.onRequest('transform', ({ id, input }) => {
    const transform = context.registry.get(id);
    if (transform === undefined) {
      return { output: '', error: context.l10n.t('Unknown transform.') };
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
    const editor = context.editors.active;
    if (editor === undefined) {
      return {
        inserted: false,
        message: context.l10n.t('Open a file first — there is no active editor.'),
      };
    }
    const inserted = await editor.transformSelection(() => text);
    return inserted
      ? { inserted }
      : {
          inserted,
          message: context.l10n.t('The editor rejected the edit. The file may be read-only.'),
        };
  });

  context.logger.debug('Scratchpad view resolved');
}

/**
 * Builds the view's HTML.
 *
 * Every interpolated value goes through `escapeHtml`: transform labels are
 * localised strings, and a translation containing an apostrophe or an angle
 * bracket must not be able to change the markup around it.
 */
function buildHtml(context: ScratchpadContext, view: ManagedWebview<ScratchpadSchema>): string {
  const nonce = generateNonce();

  const options = GROUP_ORDER.flatMap((kind) => {
    const inGroup = context.registry.all.filter((transform) => transform.kind === kind);
    if (inGroup.length === 0) {
      return [];
    }
    return [
      `<optgroup label="${escapeHtml(context.l10n.t(GROUP_LABELS[kind]))}">`,
      ...inGroup.map(
        (transform) =>
          `<option value="${escapeHtml(transform.id)}">${escapeHtml(context.l10n.t(transform.label))}</option>`
      ),
      '</optgroup>',
    ];
  }).join('\n');

  const body = `
    <label class="label" for="transform">${escapeHtml(context.l10n.t('Transform'))}</label>
    <select id="transform">
${options}
    </select>

    <label class="label" for="input">${escapeHtml(context.l10n.t('Input'))}</label>
    <textarea id="input" rows="5" spellcheck="false"></textarea>

    <label class="label" for="output">${escapeHtml(context.l10n.t('Output'))}</label>
    <textarea id="output" rows="5" spellcheck="false" readonly></textarea>

    <p id="status" class="status" role="status" aria-live="polite"></p>

    <div class="actions">
      <button id="copy" type="button">${escapeHtml(context.l10n.t('Copy'))}</button>
      <button id="insert" type="button" class="secondary">${escapeHtml(context.l10n.t('Insert at cursor'))}</button>
      <button id="swap" type="button" class="secondary">${escapeHtml(context.l10n.t('Output → Input'))}</button>
    </div>
  `;

  return createWebviewHtml({
    title: context.l10n.t('Scratchpad'),
    csp: generateCSP(view, { nonce }),
    styles: [view.asWebviewUri('media/webview/scratchpad.css')],
    // Bundled from src/webview/scratchpad.ts; the kit's RPC client is inside.
    scripts: [view.asWebviewUri('dist/webview/scratchpad.js')],
    nonce,
    body,
  });
}
