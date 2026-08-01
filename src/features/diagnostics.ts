/**
 * Diagnostics: the state report, and a verbose channel to collect it into.
 *
 * This feature owns its own logger rather than sharing the extension's. The
 * main channel is a `LogOutputChannel`, where the *user's* level selector in the
 * Output panel decides what is visible — which is right for normal logging and
 * wrong for "collect everything you know, I am filing a bug". A `'plain'`
 * channel has no such gate, so what this writes is what the user can copy.
 *
 * Its commands are registered against that logger too, so a failure while
 * producing a diagnostic report is reported in the diagnostic channel rather
 * than in the one the user was already reading.
 */

import * as vscode from 'vscode';
import {
  DisposableCollection,
  createLogger,
  formatDateFor,
  formatNumberFor,
  formatRelativeTimeFor,
  getFilePath,
  listStorageKeys,
  pluralFor,
  registerCommands,
  registerTextEditorCommands,
  run,
  tryRun,
  unwrapOr,
  type Logger,
  type SecretStore,
} from '@kkdev92/vscode-ext-kit';

import { COMMANDS, CONFIG, EXTENSION_ID, EXTENSION_NAME, STORAGE } from '../core/constants';
import { config } from '../core/config';
import { textStats } from '../lib/text';
import type { HistoryStore } from './history';

/** Commands this feature registers itself, rather than through the kit's map. */
export type DiagnosticsCommandId =
  | typeof COMMANDS.REPORT_STATE
  | typeof COMMANDS.COLLECT_DIAGNOSTICS
  | typeof COMMANDS.INSPECT_DOCUMENT;

/**
 * Locale the report is written in.
 *
 * Deliberately not the user's display language: a bug report is read by the
 * maintainer, and `2026年8月1日` next to `1.234,56` is harder to compare across
 * two reports than one fixed format. This is why the `*For` formatting variants
 * exist — they take the language instead of reading it from the editor.
 */
const REPORT_LOCALE = 'en-US';

/** Collaborators the report needs. */
export interface DiagnosticsContext {
  context: vscode.ExtensionContext;
  history: HistoryStore;
  secrets: SecretStore;
  kitVersion: string;
}

/**
 * Names where each setting's effective value came from.
 *
 * "The default" and "you set this in the workspace" produce identical values
 * and completely different bug reports.
 */
function originOf(key: Parameters<typeof config.inspect>[0]): string {
  const inspection = config.inspect(key);
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
async function buildReport(context: DiagnosticsContext, logger: Logger): Promise<string> {
  const extensionVersion =
    (context.context.extension.packageJSON as { version?: string }).version ?? 'unknown';

  const settings = Object.values(CONFIG).map((key) => {
    // tryGet rather than get: a setting that fails validation is exactly the
    // kind of thing this report exists to surface.
    const result = config.tryGet(key);
    const value = unwrapOr(result, undefined as never);
    const note = result.ok
      ? originOf(key)
      : `INVALID — ${result.error.map((issue) => issue.message).join('; ')}`;
    return `| \`${EXTENSION_ID}.${key}\` | \`${JSON.stringify(value)}\` | ${note} |`;
  });

  const globalKeys = listStorageKeys(context.context.globalState, `${EXTENSION_ID}.`);
  const workspaceKeys = listStorageKeys(context.context.workspaceState, `${EXTENSION_ID}.`);

  // Reading the keychain can fail — a locked keyring on Linux is the usual
  // reason — and a report that aborts there is worth less than one that says so.
  const secretKeys = await tryRun(logger, 'List secret names', () => context.secrets.keys());
  const secretCount = secretKeys.ok
    ? pluralFor(REPORT_LOCALE, secretKeys.value.length, {
        one: '{count} secret',
        other: '{count} secrets',
      })
    : 'unavailable (the keychain could not be read)';

  const missingFromManifest = config.checkPackageJsonSync(context.context);

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
| Extension | ${extensionVersion} |
| \`@kkdev92/vscode-ext-kit\` | ${context.kitVersion} |
| VS Code | ${vscode.version} |
| Platform | ${process.platform} ${process.arch} |
| Node | ${process.versions.node} |
| Display language | ${vscode.env.language} |

## Settings

| Setting | Value | Source |
| --- | --- | --- |
${settings.join('\n')}
${
  missingFromManifest.length === 0
    ? ''
    : `\n> Declared in the config schema but missing from \`package.json\`: ${missingFromManifest
        .map((key) => `\`${key}\``)
        .join(', ')}\n`
}
## Stored data

| | |
| --- | --- |
| History entries | ${formatNumberFor(REPORT_LOCALE, context.history.count)} |
| Last operation | ${lastOperation} |
| Global state keys | ${globalKeys.length === 0 ? '—' : globalKeys.map((key) => `\`${key}\``).join(', ')} |
| Workspace state keys | ${workspaceKeys.length === 0 ? '—' : workspaceKeys.map((key) => `\`${key}\``).join(', ')} |
| Stored secrets | ${secretCount} |

Secret *values* are held in the OS keychain and are never read by this report.

\`${STORAGE.HISTORY}\` holds the operation log — clear it with
**Quick Utils: Clear History** if it ever needs resetting.

*Numbers and dates above are formatted in ${REPORT_LOCALE} regardless of the
editor's display language, so two reports can be compared directly.*
`;
}

/**
 * Registers the diagnostics commands and the channel they write to.
 *
 * @returns A disposable owning the channel and the command registrations.
 */
export function registerDiagnostics(context: DiagnosticsContext): vscode.Disposable {
  const scope = new DisposableCollection();

  // `channelMode: 'plain'` with an explicit level: the Output panel's own level
  // selector does not apply, so a user asked to "send the logs" gets all of them.
  const logger = createLogger(`${EXTENSION_NAME} (diagnostics)`, {
    channelMode: 'plain',
    level: 'trace',
    showOnError: false,
  });
  scope.add(logger);

  const handlers: Record<
    typeof COMMANDS.REPORT_STATE | typeof COMMANDS.COLLECT_DIAGNOSTICS,
    () => Promise<void>
  > = {
    [COMMANDS.REPORT_STATE]: async () => {
      const report = await run(logger, 'Generate state report', () =>
        buildReport(context, logger)
      );
      if (report === undefined) {
        return;
      }
      const document = await vscode.workspace.openTextDocument({
        content: report,
        language: 'markdown',
      });
      await vscode.window.showTextDocument(document, { preview: false });
      logger.info('State report generated');
    },

    [COMMANDS.COLLECT_DIAGNOSTICS]: async () => {
      const report = await run(logger, 'Collect diagnostics', () => buildReport(context, logger));
      if (report === undefined) {
        return;
      }
      // Written to the plain channel so the user can select and copy it whole,
      // including the trace lines the main channel may be hiding.
      logger.info('--- state report ---');
      for (const line of report.split('\n')) {
        logger.info(line);
      }
      logger.info('--- end of state report ---');
      await vscode.env.clipboard.writeText(report);
      logger.info('Report copied to the clipboard');
    },
  };

  for (const disposable of Object.values(
    registerCommands(context.context, logger, handlers)
  )) {
    scope.add(disposable);
  }

  for (const disposable of Object.values(
    registerTextEditorCommands(context.context, logger, {
      [COMMANDS.INSPECT_DOCUMENT]: (editor: vscode.TextEditor) => {
        describeDocument(logger, editor);
      },
    })
  )) {
    scope.add(disposable);
  }

  return scope;
}

/**
 * Writes what is known about the active document to the diagnostics channel.
 *
 * Aimed at "the transform did something strange to my file": encoding, line
 * endings and size explain most of those before anyone reads any code.
 */
function describeDocument(logger: Logger, editor: vscode.TextEditor): void {
  const document = editor.document;
  const text = document.getText();
  const stats = textStats(text, vscode.env.language);
  const location = getFilePath(editor);

  logger.info('--- document ---');
  logger.info(`path: ${location?.fsPath ?? '(untitled)'}`);
  logger.info(`scheme: ${location?.uri.scheme ?? document.uri.scheme}`);
  logger.info(`language: ${document.languageId}`);
  logger.info(`line ending: ${document.eol === vscode.EndOfLine.CRLF ? 'CRLF' : 'LF'}`);
  logger.info(`dirty: ${String(document.isDirty)}`);
  logger.info(
    `size: ${formatNumberFor(REPORT_LOCALE, stats.bytes)} bytes, ` +
      `${formatNumberFor(REPORT_LOCALE, stats.lines)} lines, ` +
      `${formatNumberFor(REPORT_LOCALE, stats.graphemes)} characters`
  );
  logger.info(`selections: ${String(editor.selections.length)}`);
  logger.info('--- end of document ---');
}
