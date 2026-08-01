/**
 * Live measurement of the selection, and JSON validity for the active file.
 *
 * Both are passive: they never change the document, and they stay out of the
 * way when there is nothing to say — an empty selection hides the status bar
 * item rather than showing zeros.
 */

import * as vscode from 'vscode';
import {
  createLanguageStatusItem,
  createStatusBarItem,
  debounce,
  formatNumber,
  getLanguage,
  getOrCreateCached,
  isLanguage,
  l10n,
  plural,
  resolveOffsetsBatch,
  showInfo,
  type ManagedLanguageStatusItem,
  type ManagedStatusBarItem,
} from '@kkdev92/vscode-ext-kit';

import { COMMANDS, CONFIG, SELECTION_DEBOUNCE_MS, STATS_CACHE_LIMIT } from '../core/constants';
import { config } from '../core/config';
import { textStats, type TextStats } from '../lib/text';

/**
 * Measurements already taken, keyed by locale and text.
 *
 * `Intl.Segmenter` over a large selection is not free, and the same selection
 * gets re-measured constantly in normal use: every switch back to an editor,
 * every window focus, every settings change. A bounded LRU keeps that to one
 * measurement per distinct selection without holding on to every selection made
 * during the session.
 */
const statsCache = new Map<string, TextStats>();

function measure(text: string, locale: string): TextStats {
  return getOrCreateCached(statsCache, `${locale}\u0000${text}`, STATS_CACHE_LIMIT, () =>
    textStats(text, locale)
  );
}

/** Languages where a character count says more than a word count. */
function prefersCharacterCount(): boolean {
  return isLanguage('ja') || isLanguage('zh') || isLanguage('ko') || isLanguage('th');
}

/**
 * The locale driving word segmentation.
 *
 * It matters: `Intl.Segmenter` breaks Chinese, Japanese and Thai on a
 * dictionary, so counting words in Japanese text with an `en` segmenter gives
 * a number that means nothing.
 */
function segmentationLocale(): string {
  return getLanguage();
}

/** Combines the text of every selection, as one string per selection. */
function selectedTexts(editor: vscode.TextEditor): string[] {
  return editor.selections
    .filter((selection) => !selection.isEmpty)
    .map((selection) => editor.document.getText(selection));
}

export class InspectFeature implements vscode.Disposable {
  private readonly statusBar: ManagedStatusBarItem;
  private readonly jsonStatus: ManagedLanguageStatusItem;
  private readonly subscriptions: vscode.Disposable[] = [];

  /**
   * Recomputing on every cursor movement would run `Intl.Segmenter` over the
   * selection on each keystroke of a shift-arrow drag, so updates wait for the
   * selection to settle.
   */
  private readonly updateSoon = debounce(() => {
    this.update();
  }, SELECTION_DEBOUNCE_MS);

  constructor() {
    this.statusBar = createStatusBarItem('quickUtils.selection', {
      text: '',
      alignment: 'right',
      priority: 100,
      command: COMMANDS.INSPECT,
      tooltip: l10n.t('Quick Utils — click for full selection statistics'),
      visible: false,
    });

    this.jsonStatus = createLanguageStatusItem(
      'quickUtils.json',
      [{ language: 'json' }, { language: 'jsonc' }],
      {
        name: 'Quick Utils',
        text: '',
        command: { command: COMMANDS.JSON_FORMAT, title: l10n.t('Format JSON') },
      }
    );

    this.subscriptions.push(
      vscode.window.onDidChangeTextEditorSelection(() => {
        this.updateSoon();
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.updateSoon();
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document === vscode.window.activeTextEditor?.document) {
          this.updateSoon();
        }
      }),
      config.onDidChange(CONFIG.STATUS_BAR, () => {
        this.update();
      })
    );

    this.update();
  }

  /** Recomputes both indicators for the active editor. */
  private update(): void {
    const editor = vscode.window.activeTextEditor;
    this.updateStatusBar(editor);
    this.updateJsonStatus(editor);
  }

  private updateStatusBar(editor: vscode.TextEditor | undefined): void {
    if (editor === undefined || !config.get(CONFIG.STATUS_BAR)) {
      this.statusBar.hide();
      return;
    }

    const texts = selectedTexts(editor);
    if (texts.length === 0) {
      this.statusBar.hide();
      return;
    }

    const stats = measure(texts.join('\n'), segmentationLocale());
    const primary = prefersCharacterCount()
      ? plural(stats.graphemes, {
          one: l10n.t('{count} char'),
          other: l10n.t('{count} chars'),
        })
      : plural(stats.words, {
          one: l10n.t('{count} word'),
          other: l10n.t('{count} words'),
        });

    this.statusBar.update(`$(symbol-ruler) ${primary}`, describe(stats));
    this.statusBar.show();
  }

  /**
   * Reports whether the active JSON document parses.
   *
   * This is not a diagnostic provider — VS Code's built-in JSON language
   * service already reports syntax errors in the Problems panel. It is a
   * one-glance answer to "is this file valid right now", next to the button
   * that reformats it.
   */
  private updateJsonStatus(editor: vscode.TextEditor | undefined): void {
    if (editor === undefined) {
      this.jsonStatus.update('');
      return;
    }

    const text = editor.document.getText();
    if (text.trim().length === 0) {
      this.jsonStatus.update(l10n.t('$(circle-outline) Empty'), { severity: 'info' });
      return;
    }

    try {
      JSON.parse(text);
      this.jsonStatus.update(l10n.t('$(check) Valid JSON'), {
        severity: 'info',
        detail: l10n.t('{0} bytes', formatNumber(Buffer.byteLength(text, 'utf8'))),
      });
    } catch (error) {
      this.jsonStatus.update(l10n.t('$(error) Invalid JSON'), {
        severity: 'error',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  dispose(): void {
    this.updateSoon.cancel();
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.statusBar.dispose();
    this.jsonStatus.dispose();
  }
}

/** One-line summary used as the status bar tooltip. */
function describe(stats: TextStats): string {
  return [
    `${formatNumber(stats.graphemes)} ${l10n.t('characters')}`,
    `${formatNumber(stats.words)} ${l10n.t('words')}`,
    `${formatNumber(stats.lines)} ${l10n.t('lines')}`,
    `${formatNumber(stats.bytes)} ${l10n.t('bytes')}`,
  ].join(' · ');
}

/**
 * Shows the full statistics for the selection as a modal.
 *
 * A modal rather than a toast: these are numbers people read and compare, and
 * a toast that disappears mid-read is worse than no toast.
 */
export async function inspectSelection(editor: vscode.TextEditor): Promise<void> {
  const texts = selectedTexts(editor);
  const target = texts.length === 0 ? editor.document.getText() : texts.join('\n');
  const scope = texts.length === 0 ? l10n.t('Whole document') : describeScope(texts.length);

  const stats = measure(target, segmentationLocale());

  // Offsets are resolved in one pass rather than per selection, which is what
  // keeps this cheap on a document with hundreds of cursors.
  const bounds = editor.selections.flatMap((selection) => [selection.start, selection.end]);
  const offsets = resolveOffsetsBatch(editor.document, bounds);
  const span =
    texts.length === 0 || offsets.length === 0
      ? undefined
      : `${formatNumber(Math.min(...offsets))}–${formatNumber(Math.max(...offsets))}`;

  await showInfo(scope, {
    modal: true,
    detail: [
      `${l10n.t('Characters')}: ${formatNumber(stats.graphemes)}`,
      `${l10n.t('Code points')}: ${formatNumber(stats.characters)}`,
      `${l10n.t('Words')}: ${formatNumber(stats.words)}`,
      `${l10n.t('Lines')}: ${formatNumber(stats.lines)}`,
      `${l10n.t('Bytes (UTF-8)')}: ${formatNumber(stats.bytes)}`,
      ...(span === undefined ? [] : [`${l10n.t('Offset range')}: ${span}`]),
    ].join('\n'),
  });
}

function describeScope(selectionCount: number): string {
  return plural(selectionCount, {
    one: l10n.t('{count} selection'),
    other: l10n.t('{count} selections'),
  });
}
