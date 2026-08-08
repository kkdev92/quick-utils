/**
 * Diagnostics: the state report, and a verbose channel to collect it into.
 *
 * This feature writes to its own output channel rather than the extension's.
 * The extension's is a `LogOutputChannel`, where the *user's* level selector in
 * the Output panel decides what is visible — which is right for normal logging
 * and wrong for "collect everything you know, I am filing a bug". A plain
 * channel has no such gate, so what this writes is what the user can copy.
 */

import * as vscode from 'vscode';
import {
  formatDateFor,
  formatNumberFor,
  formatRelativeTimeFor,
  pluralFor,
  type ActiveEditor,
  type SecretStore,
} from '@kkdev92/vscode-ext-kit';

import { CONFIG, EXTENSION_ID, EXTENSION_NAME, STORAGE } from '../core/constants';
import type { Services } from '../core/services';
import { textStats } from '../lib/text';
import type { HistoryStore } from './history';

/**
 * Locale the report is written in.
 *
 * Deliberately not the user's display language: a bug report is read by the
 * maintainer, and `2026年8月1日` next to `1.234,56` is harder to compare across
 * two reports than one fixed format. This is why the `*For` formatting variants
 * exist — they take the language instead of reading it from the editor.
 */
const REPORT_LOCALE = 'en-US';

/** Versions the report names. Values, not collaborators. */
export interface BuildInfo {
  readonly extensionVersion: string;
  readonly kitVersion: string;
}

/** Collaborators the report needs. */
export interface DiagnosticsContext extends Services {
  readonly history: HistoryStore;
  readonly secrets: SecretStore;
  readonly report: ReportChannel;
  readonly build: BuildInfo;
}

/**
 * The plain output channel the report is collected into.
 *
 * A thin wrapper so the feature does not have to know it is a VS Code channel,
 * which is also what makes the report testable without a window.
 */
export interface ReportChannel {
  write(line: string): void;
  show(): void;
  dispose(): void;
}

/**
 * Creates the plain channel.
 *
 * Plain rather than a `LogOutputChannel` on purpose: the Output panel's level
 * selector does not apply to it, so a user asked to "send the logs" gets all of
 * them.
 */
export function createReportChannel(): ReportChannel {
  const channel = vscode.window.createOutputChannel(`${EXTENSION_NAME} (diagnostics)`);
  return {
    write: (line: string): void => {
      channel.appendLine(line);
    },
    show: (): void => {
      channel.show(true);
    },
    dispose: (): void => {
      channel.dispose();
    },
  };
}

/**
 * Names where each setting's effective value came from.
 *
 * "The default" and "you set this in the workspace" produce identical values
 * and completely different bug reports.
 */
function originOf(context: DiagnosticsContext, key: keyof typeof CONFIG): string {
  const inspection = context.config.inspect(CONFIG[key]);
  if (inspection === undefined) {
    return 'unknown';
  }
  if (inspection.workspaceFolderValue !== undefined) {
    return 'workspace folder';
  }
  if (inspection.workspaceValue !== undefined) {
    return 'workspace';
  }
  if (inspection.globalValue !== undefined) {
    return 'user';
  }
  return 'default';
}

/**
 * Describes an age in the report's fixed locale.
 *
 * The report is not localised, so this uses the `*For` variant rather than the
 * one that reads the editor's display language.
 */
function describeAge(elapsedMs: number): string {
  const seconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  if (seconds < 60) {
    return formatRelativeTimeFor(REPORT_LOCALE, -seconds, 'second');
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return formatRelativeTimeFor(REPORT_LOCALE, -minutes, 'minute');
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return formatRelativeTimeFor(REPORT_LOCALE, -hours, 'hour');
  }
  return formatRelativeTimeFor(REPORT_LOCALE, -Math.floor(hours / 24), 'day');
}

/** Builds the report body. */
export async function buildReport(context: DiagnosticsContext): Promise<string> {
  const snapshot = context.config.read();
  const settings = (Object.keys(CONFIG) as (keyof typeof CONFIG)[]).map((name) => {
    const key = CONFIG[name];
    // A value that fails validation never reaches here as garbage: the lenient
    // policy substitutes the default and records a diagnostic, so what the
    // report shows is what the extension is actually running on.
    const value = snapshot.get(key);
    return `| \`${EXTENSION_ID}.${key}\` | \`${JSON.stringify(value)}\` | ${originOf(context, name)} |`;
  });

  // Reading the keychain can fail — a locked keyring on Linux is the usual
  // reason — and a report that aborts there is worth less than one that says so.
  let secretCount: string;
  try {
    const keys = await context.secrets.keys();
    secretCount = pluralFor(REPORT_LOCALE, keys.length, {
      one: '{count} secret',
      other: '{count} secrets',
    });
  } catch (error) {
    context.logger.warn('Could not list secret names for the report', {
      error: String(error),
    });
    secretCount = 'unavailable (the keychain could not be read)';
  }

  // "The last thing that ran was 3 days ago" separates "this broke just now"
  // from "this has never worked for me" without asking a follow-up question.
  const [latest] = context.history.getAll();
  const lastOperation =
    latest === undefined
      ? 'none recorded'
      : `\`${latest.id}\`, ${describeAge(Date.now() - latest.timestamp)}`;

  return `# Quick Utils — state report

Generated ${formatDateFor(REPORT_LOCALE, new Date(), { dateStyle: 'medium', timeStyle: 'medium' })}

## Environment

| | |
| --- | --- |
| Extension | ${context.build.extensionVersion} |
| \`@kkdev92/vscode-ext-kit\` | ${context.build.kitVersion} |
| VS Code | ${vscode.version} |
| Platform | ${process.platform} ${process.arch} |
| Node | ${process.versions.node} |
| Display language | ${context.l10n.language} |

## Settings

| Setting | Value | Source |
| --- | --- | --- |
${settings.join('\n')}

## Stored data

| | |
| --- | --- |
| History entries | ${formatNumberFor(REPORT_LOCALE, context.history.count)} |
| Last operation | ${lastOperation} |
| Declared storage keys | ${Object.values(STORAGE)
    .map((key) => `\`${key}\``)
    .join(', ')} |
| Stored secrets | ${secretCount} |

Secret *values* are held in the OS keychain and are never read by this report.

\`${STORAGE.HISTORY}\` holds the operation log — clear it with
**Quick Utils: Clear History** if it ever needs resetting.

*Numbers and dates above are formatted in ${REPORT_LOCALE} regardless of the
editor's display language, so two reports can be compared directly.*
`;
}

/** Opens the report as an untitled markdown document. */
export async function reportState(context: DiagnosticsContext): Promise<void> {
  const report = await buildReport(context);
  const document = await vscode.workspace.openTextDocument({
    content: report,
    language: 'markdown',
  });
  await vscode.window.showTextDocument(document, { preview: false });
  context.logger.info('State report generated');
}

/** Writes the report to the plain channel and puts it on the clipboard. */
export async function collectDiagnostics(context: DiagnosticsContext): Promise<void> {
  const report = await buildReport(context);

  // Written to the plain channel so the user can select and copy it whole,
  // including what the main channel's level selector may be hiding.
  context.report.write('--- state report ---');
  for (const line of report.split('\n')) {
    context.report.write(line);
  }
  context.report.write('--- end of state report ---');
  context.report.show();

  await vscode.env.clipboard.writeText(report);
  context.logger.info('Report copied to the clipboard');
}

/**
 * Writes what is known about the active document to the diagnostics channel.
 *
 * Aimed at "the transform did something strange to my file": encoding, line
 * endings and size explain most of those before anyone reads any code.
 */
export function describeDocument(context: DiagnosticsContext, editor: ActiveEditor): void {
  const text = editor.text();
  const stats = textStats(text, context.l10n.language);
  const location = editor.location();

  context.report.write('--- document ---');
  context.report.write(`path: ${location?.fsPath ?? '(untitled)'}`);
  context.report.write(`scheme: ${location?.uri.scheme ?? '(none)'}`);
  // `\r\n` anywhere means the file is CRLF; VS Code normalises per document.
  context.report.write(`line ending: ${text.includes('\r\n') ? 'CRLF' : 'LF'}`);
  context.report.write(
    `size: ${formatNumberFor(REPORT_LOCALE, stats.bytes)} bytes, ` +
      `${formatNumberFor(REPORT_LOCALE, stats.lines)} lines, ` +
      `${formatNumberFor(REPORT_LOCALE, stats.graphemes)} characters`
  );
  context.report.write(`selections: ${String(editor.selections.length)}`);
  context.report.write('--- end of document ---');
  context.report.show();
}
