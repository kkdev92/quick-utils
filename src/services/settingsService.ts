import * as vscode from 'vscode';
import {
  type Logger,
  getSetting,
  setSetting,
  onConfigChange,
} from '@kkdev92/vscode-ext-kit';

/**
 * Configuration schema for Quick Utils.
 */
export interface QuickUtilsSettings {
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';
  dateFormat: string;
  historySize: number;
  autoRetry: boolean;
}

/**
 * Manages extension configuration backed by VS Code's workspace settings.
 * Automatically reloads when the user changes settings.
 */
export class SettingsService {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;
  private disposable: vscode.Disposable;

  constructor(private logger: Logger) {
    this.disposable = onConfigChange('quickUtils', () => {
      this._onDidChange.fire();
      this.logger.debug('Settings changed');
    });
  }

  /**
   * Returns all current settings as a snapshot.
   */
  getAll(): QuickUtilsSettings {
    return {
      logLevel: getSetting('quickUtils', 'logLevel', 'info'),
      dateFormat: getSetting('quickUtils', 'dateFormat', 'YYYY-MM-DD'),
      historySize: getSetting('quickUtils', 'historySize', 50),
      autoRetry: getSetting('quickUtils', 'autoRetry', true),
    };
  }

  /**
   * Returns the configured log level.
   */
  get logLevel(): QuickUtilsSettings['logLevel'] {
    return getSetting('quickUtils', 'logLevel', 'info');
  }

  /**
   * Returns the default date format string.
   */
  get dateFormat(): string {
    return getSetting('quickUtils', 'dateFormat', 'YYYY-MM-DD');
  }

  /**
   * Returns the maximum number of history entries to keep.
   */
  get historySize(): number {
    return getSetting('quickUtils', 'historySize', 50);
  }

  /**
   * Returns whether failed API calls should be retried automatically.
   */
  get autoRetry(): boolean {
    return getSetting('quickUtils', 'autoRetry', true);
  }

  /**
   * Updates a single configuration property.
   */
  async set<K extends keyof QuickUtilsSettings>(
    key: K,
    value: QuickUtilsSettings[K],
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
  ): Promise<void> {
    await setSetting('quickUtils', key, value, target);
    this.logger.debug('Setting updated', { key, value });
  }

  /**
   * Disposes of the configuration change listener.
   */
  dispose(): void {
    this.disposable.dispose();
    this._onDidChange.dispose();
  }
}
