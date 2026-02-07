import * as vscode from 'vscode';
import {
  type Logger,
  insertAtCursor,
  pickOne,
  showInfo,
  showError,
  wizard,
  t,
} from '@kkdev92/vscode-ext-kit';

import type { HistoryService } from '../services/historyService.js';
import type { SettingsService } from '../services/settingsService.js';
import { generateUuid, generateLoremIpsum, formatDate } from '../utils/transformers.js';

/**
 * Generates a UUID v4 and inserts it at the cursor position.
 */
export async function generateUuidCommand(
  logger: Logger,
  historyService: HistoryService
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await showInfo(t('No active editor'));
    return;
  }

  const uuid = generateUuid();
  const success = await insertAtCursor(editor, uuid);

  if (success) {
    await historyService.add({
      type: 'generate',
      operation: 'uuid',
      timestamp: Date.now(),
      output: uuid,
    });
    logger.debug('UUID generated', uuid);
  } else {
    await showError(t('Failed to insert text'));
    logger.warn('insertAtCursor failed for UUID generation');
  }
}

interface LoremChoice {
  label: string;
  value: number;
  description: string;
}

/**
 * Lets the user pick a paragraph count, generates Lorem Ipsum text,
 * and inserts it at the cursor.
 */
export async function generateLoremIpsumCommand(
  logger: Logger,
  historyService: HistoryService
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await showInfo(t('No active editor'));
    return;
  }

  const choices: LoremChoice[] = [
    { label: '1 paragraph', value: 1, description: 'Single paragraph' },
    { label: '2 paragraphs', value: 2, description: 'Two paragraphs' },
    { label: '3 paragraphs', value: 3, description: 'Three paragraphs' },
    { label: '5 paragraphs', value: 5, description: 'Five paragraphs' },
  ];

  const choice = await pickOne(choices, {
    placeHolder: t('Select number of paragraphs'),
  });

  if (!choice) {return;}

  const lorem = generateLoremIpsum(choice.value);
  const success = await insertAtCursor(editor, lorem);

  if (success) {
    await historyService.add({
      type: 'generate',
      operation: 'lorem',
      timestamp: Date.now(),
    });
    logger.debug('Lorem Ipsum generated', { paragraphs: choice.value });
  } else {
    await showError(t('Failed to insert text'));
    logger.warn('insertAtCursor failed for Lorem Ipsum generation');
  }
}

/**
 * Walks the user through a multi-step wizard to choose a date format,
 * then inserts the formatted date at the cursor.
 */
interface DateWizardState extends Record<string, unknown> {
  format: string;
  customFormat: string;
}

export async function insertDateCommand(
  logger: Logger,
  historyService: HistoryService,
  settings: SettingsService
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await showInfo(t('No active editor'));
    return;
  }

  const defaultFormat = settings.dateFormat;

  const result = await wizard<DateWizardState>({
    title: t('Insert Date'),
    showStepNumbers: true,
    steps: [
      {
        id: 'format',
        type: 'quickpick',
        placeholder: t('Select date format'),
        items: [
          { label: 'YYYY-MM-DD', description: '2024-01-15', value: 'YYYY-MM-DD' },
          { label: 'YYYY/MM/DD', description: '2024/01/15', value: 'YYYY/MM/DD' },
          { label: 'MM/DD/YYYY', description: '01/15/2024', value: 'MM/DD/YYYY' },
          { label: 'DD/MM/YYYY', description: '15/01/2024', value: 'DD/MM/YYYY' },
          { label: 'YYYY-MM-DD HH:mm:ss', description: '2024-01-15 14:30:00', value: 'YYYY-MM-DD HH:mm:ss' },
          { label: 'Custom...', description: 'Enter custom format', value: 'custom' },
        ],
      },
      {
        id: 'customFormat',
        type: 'input',
        prompt: t('Enter custom date format (e.g., YYYY-MM-DD HH:mm:ss)'),
        value: defaultFormat,
        skip: (state): boolean => state.format !== 'custom',
        validate: (value): string | undefined => {
          if (!value.trim()) {
            return t('Format cannot be empty');
          }
          return undefined;
        },
      },
    ],
  });

  if (!result.completed) {return;}

  const format =
    result.state.format === 'custom'
      ? result.state.customFormat!
      : result.state.format!;

  const dateStr = formatDate(format);
  const success = await insertAtCursor(editor, dateStr);

  if (success) {
    await historyService.add({
      type: 'generate',
      operation: 'date',
      timestamp: Date.now(),
      output: dateStr,
    });
    logger.debug('Date inserted', { format, date: dateStr });
  } else {
    await showError(t('Failed to insert text'));
    logger.warn('insertAtCursor failed for date insertion');
  }
}
