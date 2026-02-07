import * as vscode from 'vscode';
import { SimpleTreeDataProvider, type TreeItemData } from '@kkdev92/vscode-ext-kit';

/**
 * Data for a single item in the tools tree view.
 */
interface ToolItemData extends TreeItemData {
  children?: ToolItemData[];
}

/**
 * Provides the static list of available tools for the sidebar tree view.
 */
export class ToolsTreeProvider extends SimpleTreeDataProvider<ToolItemData> {
  constructor() {
    super([
      {
        id: 'transform',
        label: 'Text Transform',
        iconPath: new vscode.ThemeIcon('symbol-text'),
        contextValue: 'category',
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        children: [
          {
            id: 'upper',
            label: 'UPPER CASE',
            iconPath: new vscode.ThemeIcon('arrow-up'),
            contextValue: 'tool',
            command: { command: 'quickUtils.toUpperCase', title: 'To Upper Case' },
          },
          {
            id: 'lower',
            label: 'lower case',
            iconPath: new vscode.ThemeIcon('arrow-down'),
            contextValue: 'tool',
            command: { command: 'quickUtils.toLowerCase', title: 'To Lower Case' },
          },
          {
            id: 'camel',
            label: 'camelCase',
            iconPath: new vscode.ThemeIcon('symbol-method'),
            contextValue: 'tool',
            command: { command: 'quickUtils.toCamelCase', title: 'To camelCase' },
          },
          {
            id: 'pascal',
            label: 'PascalCase',
            iconPath: new vscode.ThemeIcon('symbol-class'),
            contextValue: 'tool',
            command: { command: 'quickUtils.toPascalCase', title: 'To PascalCase' },
          },
          {
            id: 'snake',
            label: 'snake_case',
            iconPath: new vscode.ThemeIcon('symbol-constant'),
            contextValue: 'tool',
            command: { command: 'quickUtils.toSnakeCase', title: 'To snake_case' },
          },
          {
            id: 'kebab',
            label: 'kebab-case',
            iconPath: new vscode.ThemeIcon('dash'),
            contextValue: 'tool',
            command: { command: 'quickUtils.toKebabCase', title: 'To kebab-case' },
          },
        ],
      },
      {
        id: 'encode',
        label: 'Encode / Decode',
        iconPath: new vscode.ThemeIcon('code'),
        contextValue: 'category',
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        children: [
          {
            id: 'base64Encode',
            label: 'Base64 Encode',
            iconPath: new vscode.ThemeIcon('lock'),
            contextValue: 'tool',
            command: { command: 'quickUtils.base64Encode', title: 'Base64 Encode' },
          },
          {
            id: 'base64Decode',
            label: 'Base64 Decode',
            iconPath: new vscode.ThemeIcon('unlock'),
            contextValue: 'tool',
            command: { command: 'quickUtils.base64Decode', title: 'Base64 Decode' },
          },
          {
            id: 'urlEncode',
            label: 'URL Encode',
            iconPath: new vscode.ThemeIcon('link'),
            contextValue: 'tool',
            command: { command: 'quickUtils.urlEncode', title: 'URL Encode' },
          },
          {
            id: 'urlDecode',
            label: 'URL Decode',
            iconPath: new vscode.ThemeIcon('link-external'),
            contextValue: 'tool',
            command: { command: 'quickUtils.urlDecode', title: 'URL Decode' },
          },
        ],
      },
      {
        id: 'generate',
        label: 'Generate',
        iconPath: new vscode.ThemeIcon('sparkle'),
        contextValue: 'category',
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        children: [
          {
            id: 'uuid',
            label: 'UUID',
            iconPath: new vscode.ThemeIcon('key'),
            contextValue: 'tool',
            command: { command: 'quickUtils.generateUuid', title: 'Generate UUID' },
          },
          {
            id: 'lorem',
            label: 'Lorem Ipsum',
            iconPath: new vscode.ThemeIcon('note'),
            contextValue: 'tool',
            command: { command: 'quickUtils.generateLoremIpsum', title: 'Generate Lorem Ipsum' },
          },
          {
            id: 'date',
            label: 'Date',
            iconPath: new vscode.ThemeIcon('calendar'),
            contextValue: 'tool',
            command: { command: 'quickUtils.insertDate', title: 'Insert Date' },
          },
        ],
      },
      {
        id: 'json',
        label: 'JSON',
        iconPath: new vscode.ThemeIcon('json'),
        contextValue: 'category',
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        children: [
          {
            id: 'formatJson',
            label: 'Format JSON',
            iconPath: new vscode.ThemeIcon('list-tree'),
            contextValue: 'tool',
            command: { command: 'quickUtils.formatJson', title: 'Format JSON' },
          },
          {
            id: 'minifyJson',
            label: 'Minify JSON',
            iconPath: new vscode.ThemeIcon('fold'),
            contextValue: 'tool',
            command: { command: 'quickUtils.minifyJson', title: 'Minify JSON' },
          },
        ],
      },
      {
        id: 'utilities',
        label: 'Utilities',
        iconPath: new vscode.ThemeIcon('tools'),
        contextValue: 'category',
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        children: [
          {
            id: 'regex',
            label: 'Regex Tester',
            iconPath: new vscode.ThemeIcon('regex'),
            contextValue: 'tool',
            command: { command: 'quickUtils.openRegexTester', title: 'Open Regex Tester' },
          },
        ],
      },
    ]);
  }
}
