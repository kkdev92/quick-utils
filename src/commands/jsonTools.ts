import * as vscode from 'vscode';
import {
  type Logger,
  getSelectedText,
  transformAllSelections,
  showInfo,
  showError,
  t,
} from '@kkdev92/vscode-ext-kit';

import type { HistoryService } from '../services/historyService.js';
import { isValidJson } from '../utils/validators.js';
import { formatJson, minifyJson } from '../utils/transformers.js';

/**
 * Shared logic for JSON formatting commands.
 * Validates the selection, applies the formatter, and records the operation in history.
 */
async function executeJsonCommand(
  editor: vscode.TextEditor,
  transform: (text: string) => string,
  operation: string,
  logger: Logger,
  historyService: HistoryService
): Promise<void> {
  const selected = getSelectedText(editor);
  if (!selected) {
    await showInfo(t('No text selected'));
    return;
  }

  if (!isValidJson(selected)) {
    await showError(t('Invalid JSON: {0}', 'Parse error'));
    return;
  }

  try {
    const success = await transformAllSelections(editor, transform);

    if (success) {
      await historyService.add({
        type: 'json',
        operation,
        timestamp: Date.now(),
      });
      await showInfo(t(operation === 'format' ? 'JSON formatted' : 'JSON minified'));
      logger.debug(`JSON ${operation}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await showError(t('Invalid JSON: {0}', message));
    logger.warn(`JSON ${operation} failed`, error);
  }
}

/**
 * Formats the selected JSON with indentation.
 */
export async function formatJsonCommand(
  logger: Logger,
  historyService: HistoryService
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await showInfo(t('No active editor'));
    return;
  }

  await executeJsonCommand(editor, (text) => formatJson(text, 2), 'format', logger, historyService);
}

/**
 * Minifies the selected JSON by removing whitespace.
 */
export async function minifyJsonCommand(
  logger: Logger,
  historyService: HistoryService
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await showInfo(t('No active editor'));
    return;
  }

  await executeJsonCommand(editor, minifyJson, 'minify', logger, historyService);
}
