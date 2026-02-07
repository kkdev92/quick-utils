import type * as vscode from 'vscode';
import { type Logger, registerCommands, type ManagedStatusBarItem } from '@kkdev92/vscode-ext-kit';

import type { HistoryService } from '../services/historyService.js';
import type { ApiService } from '../services/apiService.js';
import type { SettingsService } from '../services/settingsService.js';
import { transformText, directTransform } from './textTransform.js';
import {
  generateUuidCommand,
  generateLoremIpsumCommand,
  insertDateCommand,
} from './codeGenerate.js';
import { formatJsonCommand, minifyJsonCommand } from './jsonTools.js';
import { setApiKeyCommand, clearHistoryCommand } from './apiTools.js';
import { openRegexTester } from '../webview/regexTester.js';

type CommandHandler = (...args: unknown[]) => Promise<void> | void;

/**
 * Creates the full map of command IDs to their handler functions.
 */
export function createCommandHandlers(
  context: vscode.ExtensionContext,
  logger: Logger,
  historyService: HistoryService,
  statusBar: ManagedStatusBarItem,
  apiService: ApiService,
  settings: SettingsService
): Record<string, CommandHandler> {
  return {
    // Text transform
    'quickUtils.transformText': () => transformText(logger, historyService),
    'quickUtils.toUpperCase': () => directTransform('uppercase', logger, historyService),
    'quickUtils.toLowerCase': () => directTransform('lowercase', logger, historyService),
    'quickUtils.toCamelCase': () => directTransform('camelCase', logger, historyService),
    'quickUtils.toSnakeCase': () => directTransform('snakeCase', logger, historyService),
    'quickUtils.toKebabCase': () => directTransform('kebabCase', logger, historyService),
    'quickUtils.toPascalCase': () => directTransform('pascalCase', logger, historyService),
    'quickUtils.base64Encode': () => directTransform('base64Encode', logger, historyService),
    'quickUtils.base64Decode': () => directTransform('base64Decode', logger, historyService),
    'quickUtils.urlEncode': () => directTransform('urlEncode', logger, historyService),
    'quickUtils.urlDecode': () => directTransform('urlDecode', logger, historyService),

    // Code generation
    'quickUtils.generateUuid': () => generateUuidCommand(logger, historyService),
    'quickUtils.generateLoremIpsum': () => generateLoremIpsumCommand(logger, historyService),
    'quickUtils.insertDate': () => insertDateCommand(logger, historyService, settings),

    // JSON
    'quickUtils.formatJson': () => formatJsonCommand(logger, historyService),
    'quickUtils.minifyJson': () => minifyJsonCommand(logger, historyService),

    // WebView
    'quickUtils.openRegexTester': () => openRegexTester(context, logger),

    // Misc
    'quickUtils.setApiKey': () => setApiKeyCommand(logger, apiService),
    'quickUtils.clearHistory': () => clearHistoryCommand(logger, historyService),
  };
}

/**
 * Registers all command handlers with VS Code's command system.
 */
export function registerAllCommands(
  context: vscode.ExtensionContext,
  logger: Logger,
  handlers: Record<string, CommandHandler>
): void {
  registerCommands(context, logger, handlers, {
    wrapWithSafeExecute: true,
  });
}
