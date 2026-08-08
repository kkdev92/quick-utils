/**
 * Live measurement of the selection, and JSON validity for the active file.
 *
 * Both are passive: they never change the document, and they stay out of the
 * way when there is nothing to say — an empty selection hides the status bar
 * item rather than showing zeros.
 *
 * The two indicators are *declared* (see `src/extension.ts`), so the host
 * creates them at activation and disposes them at shutdown. This module only
 * decides what they say.
 */

import * as vscode from 'vscode';
import {
  debounce,
  defineLanguageStatusItem,
  defineStatusBarItem,
  getOrCreateCached,
  type ActiveEditor,
  type LocalizationService,
  type ManagedLanguageStatusItem,
  type ManagedStatusBarItem,
} from '@kkdev92/vscode-ext-kit';

import { COMMANDS, CONFIG, SELECTION_DEBOUNCE_MS, STATS_CACHE_LIMIT } from '../core/constants';
import type { Services } from '../core/services';
import { textStats, type TextStats } from '../lib/text';

/** The selection measurement, in the corner. Created at activation. */
export const SelectionStatus = defineStatusBarItem({
  id: 'quickUtils.selection',
  text: '',
  alignment: 'right',
  priority: 100,
  command: COMMANDS.INSPECT,
  visible: false,
});

/** JSON validity, shown only in JSON editors. */
export const JsonStatus = defineLanguageStatusItem({
  id: 'quickUtils.json',
  selector: [{ language: 'json' }, { language: 'jsonc' }],
  name: 'Quick Utils',
  text: '',
  command: { command: COMMANDS.JSON_FORMAT, title: 'Format JSON' },
});

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
  // A separator no locale tag and no document text can contain, so
  // ('en', 'a b') and ('en a', 'b') cannot collide.
  return getOrCreateCached(
    statsCache,
    `${locale}${String.fromCharCode(0)}${text}`,
    STATS_CACHE_LIMIT,
    () => textStats(text, locale)
  );
}

/** Languages where a character count says more than a word count. */
function prefersCharacterCount(l10n: LocalizationService): boolean {
  return l10n.is('ja') || l10n.is('zh') || l10n.is('ko') || l10n.is('th');
}

/** What the two indicators need, plus the controllers they drive. */
export interface InspectContext extends Services {
  readonly selectionStatus: ManagedStatusBarItem;
  readonly jsonStatus: ManagedLanguageStatusItem;
}

/**
 * Keeps both indicators current.
 *
 * Returned as a disposable rather than declared as a class: the host owns the
 * items, so all this owns is the event subscriptions and the debounce timer.
 */
export function watchInspectTargets(context: InspectContext): vscode.Disposable {
  /**
   * Recomputing on every cursor movement would run `Intl.Segmenter` over the
   * selection on each keystroke of a shift-arrow drag, so updates wait for the
   * selection to settle.
   */
  const updateSoon = debounce(() => {
    update();
  }, SELECTION_DEBOUNCE_MS);

  const update = (): void => {
    const editor = context.editors.active;
    updateStatusBar(context, editor);
    updateJsonStatus(context, editor);
  };

  const subscriptions = [
    vscode.window.onDidChangeTextEditorSelection(() => {
      updateSoon();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      updateSoon();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === vscode.window.activeTextEditor?.document) {
        updateSoon();
      }
    }),
    context.config.watch(CONFIG.STATUS_BAR, undefined, () => {
      update();
    }),
  ];

  update();

  return {
    dispose(): void {
      updateSoon.cancel();
      for (const subscription of subscriptions) {
        subscription.dispose();
      }
    },
  };
}

function updateStatusBar(context: InspectContext, editor: ActiveEditor | undefined): void {
  if (editor === undefined || !context.config.read().get(CONFIG.STATUS_BAR)) {
    context.selectionStatus.hide();
    return;
  }

  const texts = editor.selectedTexts().filter((text) => text.length > 0);
  if (texts.length === 0) {
    context.selectionStatus.hide();
    return;
  }

  // The locale matters: `Intl.Segmenter` breaks Chinese, Japanese and Thai on a
  // dictionary, so counting words in Japanese text with an `en` segmenter gives
  // a number that means nothing.
  const stats = measure(texts.join('\n'), context.l10n.language);
  const primary = prefersCharacterCount(context.l10n)
    ? context.l10n.plural(stats.graphemes, {
        one: context.l10n.t('{count} char'),
        other: context.l10n.t('{count} chars'),
      })
    : context.l10n.plural(stats.words, {
        one: context.l10n.t('{count} word'),
        other: context.l10n.t('{count} words'),
      });

  context.selectionStatus.set({
    text: `$(symbol-ruler) ${primary}`,
    tooltip: describe(context.l10n, stats),
  });
  context.selectionStatus.show();
}

/**
 * Reports whether the active JSON document parses.
 *
 * This is not a diagnostic provider — VS Code's built-in JSON language service
 * already reports syntax errors in the Problems panel. It is a one-glance
 * answer to "is this file valid right now", next to the button that reformats
 * it.
 */
function updateJsonStatus(context: InspectContext, editor: ActiveEditor | undefined): void {
  if (editor === undefined) {
    context.jsonStatus.update('');
    return;
  }

  const text = editor.text();
  if (text.trim().length === 0) {
    context.jsonStatus.update(context.l10n.t('$(circle-outline) Empty'), { severity: 'info' });
    return;
  }

  try {
    JSON.parse(text);
    context.jsonStatus.update(context.l10n.t('$(check) Valid JSON'), {
      severity: 'info',
      detail: context.l10n.t(
        '{0} bytes',
        context.l10n.number(Buffer.byteLength(text, 'utf8'))
      ),
    });
  } catch (error) {
    context.jsonStatus.update(context.l10n.t('$(error) Invalid JSON'), {
      severity: 'error',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

/** One-line summary used as the status bar tooltip. */
function describe(l10n: LocalizationService, stats: TextStats): string {
  return [
    `${l10n.number(stats.graphemes)} ${l10n.t('characters')}`,
    `${l10n.number(stats.words)} ${l10n.t('words')}`,
    `${l10n.number(stats.lines)} ${l10n.t('lines')}`,
    `${l10n.number(stats.bytes)} ${l10n.t('bytes')}`,
  ].join(' · ');
}

/**
 * Shows the full statistics for the selection as a modal.
 *
 * A modal rather than a toast: these are numbers people read and compare, and
 * a toast that disappears mid-read is worse than no toast.
 */
export async function inspectSelection(context: Services, editor: ActiveEditor): Promise<void> {
  const texts = editor.selectedTexts().filter((text) => text.length > 0);
  const target = texts.length === 0 ? editor.text() : texts.join('\n');
  const scope =
    texts.length === 0
      ? context.l10n.t('Whole document')
      : describeScope(context.l10n, texts.length);

  const stats = measure(target, context.l10n.language);

  // Offsets are resolved in one pass rather than per selection, which is what
  // keeps this cheap on a document with hundreds of cursors.
  const bounds = editor.selections.flatMap((selection) => [selection.start, selection.end]);
  const offsets = editor.offsetsAt(bounds);
  const span =
    texts.length === 0 || offsets.length === 0
      ? undefined
      : `${context.l10n.number(Math.min(...offsets))}–${context.l10n.number(Math.max(...offsets))}`;

  await context.notify.info(scope, {
    modal: true,
    detail: [
      `${context.l10n.t('Characters')}: ${context.l10n.number(stats.graphemes)}`,
      `${context.l10n.t('Code points')}: ${context.l10n.number(stats.characters)}`,
      `${context.l10n.t('Words')}: ${context.l10n.number(stats.words)}`,
      `${context.l10n.t('Lines')}: ${context.l10n.number(stats.lines)}`,
      `${context.l10n.t('Bytes (UTF-8)')}: ${context.l10n.number(stats.bytes)}`,
      ...(span === undefined ? [] : [`${context.l10n.t('Offset range')}: ${span}`]),
    ].join('\n'),
  });
}

function describeScope(l10n: LocalizationService, selectionCount: number): string {
  return l10n.plural(selectionCount, {
    one: l10n.t('{count} selection'),
    other: l10n.t('{count} selections'),
  });
}
