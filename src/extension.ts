import * as vscode from 'vscode';
import {
  createLogger,
  DisposableCollection,
  getSetting,
  onConfigChange,
  createStatusBarItem,
  createTreeView,
  createFileWatcher,
  type Logger,
} from '@kkdev92/vscode-ext-kit';

import { createCommandHandlers, registerAllCommands } from './commands/index.js';
import { ToolsTreeProvider } from './providers/toolsTreeProvider.js';
import { HistoryTreeProvider } from './providers/historyTreeProvider.js';
import { HistoryService } from './services/historyService.js';
import { SettingsService } from './services/settingsService.js';
import { ApiService } from './services/apiService.js';

let logger: Logger | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const disposables = new DisposableCollection();

  // Logger
  logger = createLogger('Quick Utils', {
    level: getSetting('quickUtils', 'logLevel', 'info'),
    showOnError: true,
    timestamp: true,
  });
  disposables.add(logger);

  // Settings
  const settings = new SettingsService(logger);
  disposables.add(settings);

  // Reload settings when configuration changes
  disposables.add(
    onConfigChange('quickUtils', () => {
      logger?.setLevel(settings.logLevel);
      logger?.info('Configuration updated');
    })
  );

  // Status bar
  const statusBar = createStatusBarItem('quickUtils.status', {
    text: '$(tools) Quick Utils',
    tooltip: 'Quick Utils ready',
    alignment: 'right',
    priority: 100,
    command: 'quickUtils.transformText',
  });
  disposables.add(statusBar);

  // API service
  const apiService = new ApiService(context, logger);

  // History service
  const historyService = new HistoryService(context, logger, settings);
  disposables.add(historyService);

  // TreeView providers
  const toolsProvider = new ToolsTreeProvider();
  const historyProvider = new HistoryTreeProvider(historyService);

  createTreeView(context, 'quickUtils.toolsList', toolsProvider, {
    showCollapseAll: true,
  });
  createTreeView(context, 'quickUtils.history', historyProvider, {
    showCollapseAll: false,
  });
  disposables.add(historyProvider);

  // File watcher for .quickutilsrc
  const fileWatcher = createFileWatcher({
    patterns: ['**/.quickutilsrc', '**/.quickutilsrc.json'],
    debounceDelay: 500,
    events: ['create', 'change', 'delete'],
  });
  fileWatcher.onDidChange((events) => {
    for (const event of events) {
      logger?.info(`Config file ${event.type}: ${event.uri.fsPath}`);
    }
  });
  disposables.add(fileWatcher);

  // Register commands
  const handlers = createCommandHandlers(
    context, logger, historyService, statusBar, apiService, settings
  );
  registerAllCommands(context, logger, handlers);

  // Register disposables
  context.subscriptions.push(disposables);

  logger.info('Quick Utils activated');
}

export function deactivate(): void {
  logger?.info('Quick Utils deactivated');
}
