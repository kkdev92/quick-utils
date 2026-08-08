/**
 * Applying transforms to the editor.
 *
 * Outputs are computed for every selection *before* any edit is applied, so a
 * transform that rejects its input (decoding prose as Base64, reformatting
 * broken JSON) reports the problem with the document untouched. Transforming
 * inside the edit callback would leave the first selections changed and the
 * rest not.
 */

import * as vscode from 'vscode';
import {
  RetryExhaustedError,
  retry,
  toPickItem,
  toPickSeparator,
  withTiming,
  type ActiveEditor,
  type LocalizationService,
  type PickItem,
  type StatusBarService,
  type TypedStorage,
} from '@kkdev92/vscode-ext-kit';
// Both are vscode-free, so they ship as their own subpaths.

import { translatable } from '../core/i18n';
import type { Services } from '../core/services';
import type { TransformRegistry } from '../core/transforms';
import type { TransformDescriptor, TransformKind } from '../core/types';
import type { HistoryStore } from './history';

/** Collaborators the transform commands need. */
export interface TransformContext extends Services {
  registry: TransformRegistry;
  history: HistoryStore;
  /** Last applied transform id, backing "Apply Again". */
  lastTransform: TypedStorage<string | undefined>;
  /** Short-lived confirmations, in the corner. */
  status: StatusBarService;
}

/** Group headings in the transform picker, in display order. */
const GROUP_LABELS: Record<TransformKind, string> = {
  case: translatable('Change Case'),
  codec: translatable('Encode / Decode'),
  lines: translatable('Lines'),
  json: translatable('JSON'),
};

const GROUP_ORDER: readonly TransformKind[] = ['case', 'codec', 'lines', 'json'];

/** A picker entry: either a selectable transform or a group heading. */
export type TransformPickEntry = PickItem<string> | vscode.QuickPickItem;

/** Builds the grouped picker list. Separators keep the filter box matching on names alone. */
export function buildPickEntries(
  l10n: LocalizationService,
  registry: TransformRegistry
): TransformPickEntry[] {
  const entries: TransformPickEntry[] = [];
  for (const kind of GROUP_ORDER) {
    const inGroup = registry.all.filter((transform) => transform.kind === kind);
    if (inGroup.length === 0) {
      continue;
    }
    entries.push(toPickSeparator(l10n.t(GROUP_LABELS[kind])) as TransformPickEntry);
    for (const transform of inGroup) {
      entries.push(
        toPickItem(transform.id, { label: l10n.t(transform.label), icon: transform.icon })
      );
    }
  }
  return entries;
}

/** Asks which transform to apply, then applies it. */
export async function pickAndTransform(
  context: TransformContext,
  editor: ActiveEditor
): Promise<void> {
  const picked = await context.ask.one(buildPickEntries(context.l10n, context.registry), {
    placeHolder: context.l10n.t('Select a transform'),
  });
  if (picked === undefined || !('value' in picked)) {
    return;
  }

  await applyTransformById(context, editor, picked.value);
}

/** Applies a transform named by id — the path every per-transform command takes. */
export async function applyTransformById(
  context: TransformContext,
  editor: ActiveEditor,
  id: string
): Promise<void> {
  const transform = context.registry.get(id);
  if (transform === undefined) {
    // Only reachable from a stale keybinding or a manifest/registry mismatch.
    context.logger.error('Unknown transform id', new Error(id));
    return;
  }
  await applyTransform(context, editor, transform);
}

/** Re-applies whatever ran last. */
export async function transformAgain(
  context: TransformContext,
  editor: ActiveEditor
): Promise<void> {
  const id = context.lastTransform.get();
  const transform = id === undefined ? undefined : context.registry.get(id);
  if (transform === undefined) {
    await context.notify.error(context.l10n.t('Nothing to apply again — run a transform first.'));
    return;
  }
  await applyTransform(context, editor, transform);
}

/**
 * Ensures there is something to transform, expanding an empty selection the
 * way the transform's own shape implies.
 *
 * @returns false when there is genuinely nothing to act on.
 */
export function ensureSelection(editor: ActiveEditor, kind: TransformKind): boolean {
  // `TextRange` is plain data, so "is this selection empty?" is spelled out
  // rather than asked of a vscode.Selection.
  const isEmpty = (range: (typeof editor.selections)[number]): boolean =>
    range.start.line === range.end.line && range.start.character === range.end.character;
  if (editor.selections.some((selection) => !isEmpty(selection))) {
    return true;
  }

  // Line and JSON operations are document-shaped: with nothing selected, the
  // whole document is what the user means.
  if (kind === 'lines' || kind === 'json') {
    const text = editor.text();
    if (text.length === 0) {
      return false;
    }
    editor.select(editor.rangeOfOffsets(0, text.length));
    return true;
  }

  // Case and codec operations are word-shaped: the word under the cursor is
  // what "camelCase this" means with nothing selected, falling back to the
  // line when the cursor sits on punctuation.
  if (editor.selectWord()) {
    return true;
  }
  if (editor.currentLine().trim().length === 0) {
    return false;
  }
  editor.selectLine(editor.selections[0]?.start.line ?? 0);
  return true;
}

/** Applies `transform` to every selection and records the result. */
async function applyTransform(
  context: TransformContext,
  editor: ActiveEditor,
  transform: TransformDescriptor
): Promise<void> {
  if (!ensureSelection(editor, transform.kind)) {
    await context.notify.error(context.l10n.t('Select some text first.'));
    return;
  }

  const inputs = editor.selectedTexts();

  let outputs: string[];
  try {
    outputs = inputs.map((input) => transform.apply(input));
  } catch (error) {
    // The lib layer's messages are written for this moment ("Input decodes to
    // bytes that are not valid UTF-8 text"), so they are shown verbatim.
    const detail = error instanceof Error ? error.message : String(error);
    await context.notify.error(context.l10n.t('{0} failed: {1}', context.l10n.t(transform.label), detail));
    context.logger.debug('transform rejected its input', { id: transform.id, detail });
    return;
  }

  const { result: applied, duration } = await withTiming(
    `transform:${transform.id}`,
    () => editor.transformSelections((original, index) => outputs[index] ?? original),
    { logger: context.logger }
  );

  if (!applied) {
    await context.notify.error(context.l10n.t('The editor rejected the edit. The file may be read-only.'));
    return;
  }

  const counted = context.l10n.plural(outputs.length, {
    one: context.l10n.t('{count} selection'),
    other: context.l10n.t('{count} selections'),
  });
  context.status.flash(
    `$(check) ${context.l10n.t(transform.label)} · ${counted} · ${String(Math.round(duration))}ms`,
    2500
  );

  await context.lastTransform.set(transform.id);
  await context.history.add({
    id: transform.id,
    kind: transform.kind === 'json' ? 'json' : 'transform',
    timestamp: Date.now(),
    ...fileField(editor),
  });
}

/** Records which file an operation ran against, when it ran against one. */
export function fileField(editor: ActiveEditor): { file?: string } {
  const location = editor.location();
  if (location === undefined) {
    return {};
  }
  const basename = location.fsPath.split(/[\\/]/).pop();
  return basename === undefined || basename.length === 0 ? {} : { file: basename };
}

/**
 * Transforms the clipboard in place.
 *
 * The read is retried because clipboard access is genuinely flaky: the
 * clipboard is a shared, lockable OS resource, and another process holding it
 * makes the read fail rather than wait. Three quick attempts turn that into a
 * non-event.
 */
export async function transformClipboard(context: TransformContext): Promise<void> {
  let text: string;
  try {
    text = await retry(async () => vscode.env.clipboard.readText(), {
      maxAttempts: 3,
      delay: 50,
      backoff: 'linear',
      jitter: 'none',
      onRetry: (error, attempt) => {
        context.logger.debug('clipboard read failed; retrying', { attempt, error: String(error) });
      },
    });
  } catch (error) {
    if (error instanceof RetryExhaustedError) {
      context.logger.error('Clipboard read failed', error, { attempts: error.attempts });
      await context.notify.error(context.l10n.t('Could not read the clipboard. Another application may be holding it.'));
      return;
    }
    throw error;
  }

  if (text.length === 0) {
    await context.notify.error(context.l10n.t('The clipboard is empty.'));
    return;
  }

  const picked = await context.ask.one(buildPickEntries(context.l10n, context.registry), {
    placeHolder: context.l10n.t('Transform the clipboard contents'),
  });
  if (picked === undefined || !('value' in picked)) {
    return;
  }

  const transform = context.registry.get(picked.value);
  if (transform === undefined) {
    return;
  }

  let output: string;
  try {
    output = transform.apply(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await context.notify.error(context.l10n.t('{0} failed: {1}', context.l10n.t(transform.label), detail));
    return;
  }

  await vscode.env.clipboard.writeText(output);
  context.status.flash(
    `$(clippy) ${context.l10n.t('Clipboard transformed')} · ${context.l10n.t(transform.label)}`,
    2500
  );
  await context.lastTransform.set(transform.id);
}
