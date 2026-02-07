import * as vscode from 'vscode';
import { BaseTreeDataProvider, type TreeItemData, formatRelativeTime, throttle } from '@kkdev92/vscode-ext-kit';
import type { HistoryService, HistoryEntry } from '../services/historyService.js';

/**
 * Data for a single item in the history tree view.
 */
type HistoryItemData = TreeItemData<HistoryEntry>;

/**
 * Provides a live-updating tree view of recent operations.
 * Throttles refreshes to avoid excessive redraws.
 */
export class HistoryTreeProvider extends BaseTreeDataProvider<HistoryItemData> {
  private listener: vscode.Disposable;

  constructor(private historyService: HistoryService) {
    super();
    const throttledRefresh = throttle(() => this.refresh(), 300);
    this.listener = this.historyService.onDidChange(() => throttledRefresh());
  }

  getRoots(): HistoryItemData[] {
    return this.historyService.getAll().map((entry, index) => {
      const escapedOutput = entry.output?.replace(/`/g, '\\`');

      return {
        id: `${entry.timestamp}:${index}`,
        label: `${entry.type}: ${entry.operation}`,
        description: this.formatTimestamp(entry.timestamp),
        iconPath: this.getIcon(entry.type),
        contextValue: 'historyEntry',
        tooltip: entry.output
          ? new vscode.MarkdownString(`**Output:** \`${escapedOutput}\``)
          : undefined,
        data: entry,
      };
    });
  }

  getChildrenOf(_element: HistoryItemData): HistoryItemData[] {
    return [];
  }

  dispose(): void {
    this.listener.dispose();
    super.dispose();
  }

  private formatTimestamp(timestamp: number): string {
    const diff = Date.now() - timestamp;

    if (diff < 60_000) {
      return formatRelativeTime(0, 'second', 'narrow');
    }
    if (diff < 3_600_000) {
      return formatRelativeTime(-Math.floor(diff / 60_000), 'minute', 'short');
    }
    if (diff < 86_400_000) {
      return formatRelativeTime(-Math.floor(diff / 3_600_000), 'hour', 'short');
    }
    return formatRelativeTime(-Math.floor(diff / 86_400_000), 'day', 'short');
  }

  private getIcon(type: string): vscode.ThemeIcon {
    switch (type) {
      case 'transform':
        return new vscode.ThemeIcon('symbol-text');
      case 'generate':
        return new vscode.ThemeIcon('sparkle');
      case 'json':
        return new vscode.ThemeIcon('json');
      default:
        return new vscode.ThemeIcon('history');
    }
  }
}
