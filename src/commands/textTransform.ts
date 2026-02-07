import * as vscode from 'vscode';
import {
  type Logger,
  getSelectedText,
  transformAllSelections,
  pickOne,
  showInfo,
  showError,
  showWithActions,
  showStatusMessage,
  withTiming,
  t,
} from '@kkdev92/vscode-ext-kit';

import type { HistoryService } from '../services/historyService.js';
import { type TransformType, getTransformer } from '../utils/transformers.js';
import { isValidBase64 } from '../utils/validators.js';

interface TransformChoice {
  label: string;
  value: TransformType;
  description?: string;
}

const transformChoices: TransformChoice[] = [
  { label: 'UPPER CASE', value: 'uppercase', description: 'Convert to uppercase' },
  { label: 'lower case', value: 'lowercase', description: 'Convert to lowercase' },
  { label: 'camelCase', value: 'camelCase', description: 'Convert to camelCase' },
  { label: 'PascalCase', value: 'pascalCase', description: 'Convert to PascalCase' },
  { label: 'snake_case', value: 'snakeCase', description: 'Convert to snake_case' },
  { label: 'kebab-case', value: 'kebabCase', description: 'Convert to kebab-case' },
  { label: 'Base64 Encode', value: 'base64Encode', description: 'Encode to Base64' },
  { label: 'Base64 Decode', value: 'base64Decode', description: 'Decode from Base64' },
  { label: 'URL Encode', value: 'urlEncode', description: 'URL encode' },
  { label: 'URL Decode', value: 'urlDecode', description: 'URL decode' },
];

/**
 * Displays a picker for the user to choose a text transformation,
 * then applies it to all selections.
 */
export async function transformText(
  logger: Logger,
  historyService: HistoryService
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await showInfo(t('No active editor'));
    return;
  }

  const selected = getSelectedText(editor);
  if (!selected) {
    await showInfo(t('No text selected'));
    return;
  }

  const choice = await pickOne(transformChoices, {
    placeHolder: t('Select transformation type'),
  });

  if (!choice) {return;}

  await applyTransform(editor, choice.value, logger, historyService);
}

/**
 * Applies the given text transformation directly to all selections without prompting.
 */
export async function directTransform(
  type: TransformType,
  logger: Logger,
  historyService: HistoryService
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await showInfo(t('No active editor'));
    return;
  }

  const selected = getSelectedText(editor);
  if (!selected) {
    await showInfo(t('No text selected'));
    return;
  }

  await applyTransform(editor, type, logger, historyService);
}

/**
 * Applies a transformation to every selection in the active editor.
 * Records the operation in history and offers an undo action.
 */
async function applyTransform(
  editor: vscode.TextEditor,
  type: TransformType,
  logger: Logger,
  historyService: HistoryService
): Promise<void> {
  // Validate Base64 input before attempting to decode
  if (type === 'base64Decode') {
    const selected = getSelectedText(editor);
    if (!isValidBase64(selected)) {
      await showError(t('Invalid Base64 input'));
      return;
    }
  }

  const transformer = getTransformer(type);

  try {
    const { result, duration } = await withTiming(
      'textTransform',
      () => transformAllSelections(editor, (text) => transformer(text)),
      { logger, logLevel: 'debug' }
    );

    if (result) {
      await historyService.add({
        type: 'transform',
        operation: type,
        timestamp: Date.now(),
      });

      showStatusMessage(`$(check) ${type}`, 2000);

      const action = await showWithActions(
        'info',
        t('Transformed in {0}ms', duration.toFixed(0)),
        [{ title: t('Undo'), value: 'undo' }]
      );

      if (action === 'undo') {
        await vscode.commands.executeCommand('undo');
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await showError(t('Transform failed: {0}', message));
    logger.warn(`Transform ${type} failed`, error);
  }
}
