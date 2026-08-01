/**
 * Applying several transforms in one go.
 *
 * "Trim trailing whitespace, then remove duplicates, then sort" is a thing
 * people do three commands at a time. This runs the chosen transforms in
 * order, and collapses the whole run into a single undo step.
 *
 * Each stage is applied as its own edit rather than by composing the functions
 * and writing once. That is deliberate: the result is then exactly what running
 * the commands one after another would have produced, including how each stage
 * sees the document the previous one left behind. `applyEditsGrouped` is what
 * keeps that from becoming N entries in the undo stack.
 */

import * as vscode from 'vscode';
import {
  applyEditsGrouped,
  getAllSelectedText,
  l10n,
  pickMany,
  plural,
  showError,
  showStatusMessage,
  withTiming,
} from '@kkdev92/vscode-ext-kit';

import type { TransformDescriptor } from '../core/types';
import { buildPickEntries, ensureSelection, fileField } from './transform';
import type { TransformContext } from './transform';

/**
 * Asks which transforms to run, then runs them in order.
 *
 * `pickMany` returns items in list order, not in the order they were ticked, so
 * the pipeline runs in the order shown in the picker. The prompt says so —
 * guessing at a click order the API does not report would be worse than being
 * explicit about the one it does.
 */
export async function runPipeline(
  context: TransformContext,
  editor: vscode.TextEditor
): Promise<void> {
  const picked = await pickMany(buildPickEntries(context.registry), {
    placeHolder: l10n.t('Select transforms to run in sequence'),
    prompt: l10n.t('Applied top to bottom, in the order shown here.'),
  });
  if (picked === undefined || picked.length === 0) {
    return;
  }

  const stages = picked
    .filter((entry): entry is Extract<typeof entry, { value: string }> => 'value' in entry)
    .map((entry) => context.registry.get(entry.value))
    .filter((transform): transform is TransformDescriptor => transform !== undefined);

  if (stages.length === 0) {
    return;
  }

  // The scope is resolved once, from the first stage: a pipeline that silently
  // switched between "the word under the cursor" and "the whole document"
  // between stages would be impossible to predict.
  const first = stages[0] as TransformDescriptor;
  if (!ensureSelection(editor, first.kind)) {
    await showError(l10n.t('Select some text first.'));
    return;
  }

  // Dry run before touching the document, for the same reason a single
  // transform does: a stage that rejects its input must not leave the earlier
  // stages applied.
  const failure = dryRun(getAllSelectedText(editor), stages);
  if (failure !== undefined) {
    await showError(
      l10n.t(
        'Stage {0} ({1}) failed: {2}',
        String(failure.stage + 1),
        l10n.t(failure.transform.label),
        failure.detail
      )
    );
    context.logger.debug('pipeline stage rejected its input', {
      id: failure.transform.id,
      stage: failure.stage,
    });
    return;
  }

  const { result: applied, duration } = await withTiming(
    'pipeline',
    () =>
      applyEditsGrouped(
        editor,
        stages.map((stage) => (builder: vscode.TextEditorEdit): void => {
          // Read inside the callback: the previous stage's edit has already been
          // applied, so both the selections and their text are current.
          for (const selection of editor.selections) {
            builder.replace(selection, stage.apply(editor.document.getText(selection)));
          }
        })
      ),
    { logger: context.logger }
  );

  if (!applied) {
    await showError(l10n.t('The editor rejected the edit. The file may be read-only.'));
    return;
  }

  showStatusMessage(
    `$(check) ${plural(stages.length, {
      one: l10n.t('{count} transform'),
      other: l10n.t('{count} transforms'),
    })} · ${String(Math.round(duration))}ms`,
    2500
  );

  const last = stages[stages.length - 1] as TransformDescriptor;
  await context.lastTransform.set(last.id);
  await context.history.add({
    id: last.id,
    kind: last.kind === 'json' ? 'json' : 'transform',
    timestamp: Date.now(),
    ...fileField(editor),
  });
}

/** Which stage rejects the input, if any, without touching the document. */
function dryRun(
  inputs: readonly string[],
  stages: readonly TransformDescriptor[]
): { stage: number; transform: TransformDescriptor; detail: string } | undefined {
  for (const input of inputs) {
    let text = input;
    for (const [index, stage] of stages.entries()) {
      try {
        text = stage.apply(text);
      } catch (error) {
        return {
          stage: index,
          transform: stage,
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }
  return undefined;
}
