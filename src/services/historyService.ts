import * as vscode from 'vscode';
import {
  type Logger,
  createGlobalStorage,
  type TypedStorage,
} from '@kkdev92/vscode-ext-kit';

import type { SettingsService } from './settingsService.js';

/**
 * A single recorded operation.
 */
export interface HistoryEntry {
  type: string;
  operation: string;
  timestamp: number;
  input?: string;
  output?: string;
}

/**
 * Persisted history data stored in globalState.
 */
interface HistoryData {
  entries: HistoryEntry[];
  version: number;
}

/**
 * Manages a capped, persisted history of operations using VS Code's globalState.
 * Emits events when the history changes.
 */
export class HistoryService implements vscode.Disposable {
  private storage: TypedStorage<HistoryData>;
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    context: vscode.ExtensionContext,
    private logger: Logger,
    private settings: SettingsService
  ) {
    this.storage = createGlobalStorage<HistoryData>(context, 'quickUtils.history', {
      defaultValue: { entries: [], version: 1 },
      validate: (v): v is HistoryData =>
        typeof v === 'object' && v !== null && Array.isArray((v as HistoryData).entries),
      migrate: (old, version) => {
        if (version < 1) {
          return { entries: [], version: 1 };
        }
        return old as HistoryData;
      },
      version: 1,
    });
  }

  /**
   * Appends an entry to the history, evicting the oldest if at capacity.
   */
  async add(entry: HistoryEntry): Promise<void> {
    const data = this.storage.get();
    const maxSize = this.settings.historySize;

    data.entries.unshift(entry);
    if (data.entries.length > maxSize) {
      data.entries = data.entries.slice(0, maxSize);
    }

    await this.storage.set(data);
    this._onDidChange.fire();
    this.logger.debug('History entry added', entry);
  }

  /**
   * Returns all history entries, most recent first.
   */
  getAll(): HistoryEntry[] {
    return this.storage.get().entries;
  }

  /**
   * Removes all history entries.
   */
  async clear(): Promise<void> {
    await this.storage.reset();
    this._onDidChange.fire();
    this.logger.info('History cleared');
  }

  /**
   * Returns the number of stored history entries.
   */
  get count(): number {
    return this.storage.get().entries.length;
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
