/**
 * The Regex Tester panel.
 *
 * The webview owns the UI and nothing else: it has no access to the file
 * system, and it does not run the pattern. Every match request crosses the RPC
 * channel to the host, which runs it in the regex worker under a timeout — so
 * a pattern typed into the tester can neither read the workspace nor hang the
 * editor.
 */

import * as vscode from 'vscode';
import {
  DisposableCollection,
  generateCSP,
  generateNonce,
  s,
  validateSchema,
  type ManagedFileWatcher,
  type ManagedWebviewPanel,
} from '@kkdev92/vscode-ext-kit';

import { CONFIG, EXTENSION_ID, REGEX_MATCH_LIMIT, REGEX_TESTER_VIEW_TYPE } from '../core/constants';
import type { TesterServices } from '../core/services';
import { RegexError } from '../lib/regex';
import { RegexTimeoutError } from '../regex/client';
// The RPC contract lives in a vscode-free module so the page script bundle is
// typed against the exact same interfaces — see src/webview/protocol.ts.
import type { RegexTesterSchema, Subject } from '../webview/protocol';

/** Formats the match count, noting when the collection was cut short. */
function summarise(context: TesterServices, count: number, truncated: boolean): string {
  const counted = context.l10n.plural(count, {
    zero: context.l10n.t('No matches'),
    one: context.l10n.t('{count} match'),
    other: context.l10n.t('{count} matches'),
  });
  return truncated
    ? `${counted} · ${context.l10n.t('stopped at the first {0}', String(REGEX_MATCH_LIMIT))}`
    : counted;
}

/**
 * Schema for the one request whose parameters cross a trust boundary.
 *
 * The webview runs page script, so its messages are input rather than
 * arguments: a malformed `test` payload should be rejected here, not passed
 * into the worker.
 */
const testParamsSchema = s.object({
  pattern: s.string({ maxLength: 4096 }),
  flags: s.string({ maxLength: 8, pattern: /^[gimsuyvd]*$/ }),
  input: s.string(),
});

type TesterPanel = ManagedWebviewPanel<RegexTesterSchema>;

/** At most one tester panel exists; a second invocation reveals the first. */
let current: TesterPanel | undefined;

/** Opens the tester, or reveals it if already open. */
export async function openRegexTester(context: TesterServices): Promise<void> {
  if (current !== undefined) {
    current.reveal(vscode.ViewColumn.Beside);
    return;
  }

  const panel = context.webviews.openPanel<RegexTesterSchema>({
    viewType: REGEX_TESTER_VIEW_TYPE,
    title: context.l10n.t('Regex Tester'),
    column: vscode.ViewColumn.Beside,
    enableScripts: true,
  });

  await initialiseRegexTester(context, panel);
}

/**
 * Wires up a fresh (or restored) panel: HTML, RPC handlers, teardown.
 *
 * Exported because the restore path comes from `module.webviews.restorePanel`
 * rather than from here — the webview restores its own pattern and subject via
 * `setState`/`getState`, so a restored panel needs nothing replayed, only the
 * same wiring.
 */
export async function initialiseRegexTester(
  context: TesterServices,
  panel: TesterPanel
): Promise<void> {
  current?.dispose();
  current = panel;

  /** The document a subject was taken from, so matches can be revealed in it. */
  let boundDocument: vscode.Uri | undefined;

  /**
   * Whatever keeps the current subject up to date — a single-file watcher, or a
   * glob watcher. Grouped so that switching sources tears the previous one down
   * without each call site remembering to.
   */
  const subjectSources = new DisposableCollection();

  panel.onDidDispose(() => {
    subjectSources.dispose();
    if (current === panel) {
      current = undefined;
    }
  });

  const nonce = generateNonce();
  await panel.setHtmlFromTemplate('media/webview/regex-tester.html', {
    csp: generateCSP(panel, { nonce }),
    nonce,
    title: context.l10n.t('Regex Tester'),
    patternLabel: context.l10n.t('Pattern'),
    flagsLabel: context.l10n.t('Flags'),
    subjectLabel: context.l10n.t('Subject text'),
    fromEditorLabel: context.l10n.t('From editor'),
    fromFileLabel: context.l10n.t('From file…'),
    fromGlobLabel: context.l10n.t('From glob…'),
    noMatchesLabel: context.l10n.t('No matches'),
  });

  panel.rpc.onRequest('test', async (params) => {
    const validated = validateSchema(testParamsSchema, params);
    if (!('value' in validated)) {
      context.logger.warn('Rejected a malformed test request from the webview', {
        issues: validated.issues.map((issue) => issue.message),
      });
      return {
        matches: [],
        truncated: false,
        summary: '',
        error: context.l10n.t('Invalid request.'),
      };
    }

    const { pattern, flags, input } = validated.value;
    if (pattern.length === 0) {
      return { matches: [], truncated: false, summary: '' };
    }

    const timeoutMs = context.config.read().get(CONFIG.REGEX_TIMEOUT);
    try {
      // An operation of its own: the scan needs a signal that dies with the
      // extension, and an RPC handler is not a command so nothing hands it one.
      const { matches, truncated } = await context.operations.run(
        'regexTester.test',
        (operation) =>
          context.client.run(
            { pattern, flags, input, limit: REGEX_MATCH_LIMIT },
            timeoutMs,
            operation.signal
          )
      );
      return { matches, truncated, summary: summarise(context, matches.length, truncated) };
    } catch (error) {
      if (error instanceof RegexTimeoutError) {
        void warnAboutTimeout(context, timeoutMs);
        return { matches: [], truncated: false, summary: '', error: error.message };
      }
      if (error instanceof RegexError) {
        return { matches: [], truncated: false, summary: '', error: error.message };
      }
      context.logger.error('The regex tester could not run a pattern', error);
      return {
        matches: [],
        truncated: false,
        summary: '',
        error: context.l10n.t('The pattern could not be run.'),
      };
    }
  });

  panel.rpc.onRequest('loadFromEditor', () => {
    // The tester itself is not a text editor, so the active editor already
    // points at the document beside it.
    const source = context.editors.active;
    const location = source?.location();
    if (source === undefined || location === undefined) {
      return null;
    }

    const selection = source.selectedText();
    boundDocument = vscode.Uri.parse(location.uri.toString());
    subjectSources.dispose();

    return {
      name: location.uri.path.split('/').pop() ?? context.l10n.t('editor'),
      text: selection.length > 0 ? selection : source.text(),
    };
  });

  panel.rpc.onRequest('loadFromFile', async () => {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: context.l10n.t('Use as subject'),
    });
    const uri = picked?.[0];
    if (uri === undefined) {
      return null;
    }

    const subject = await readSubject(context, uri);
    if (subject === undefined) {
      return null;
    }

    boundDocument = uri;

    // Keep the subject current: testing a pattern against a log file that is
    // still being written is a large part of why loading from a file is useful.
    subjectSources.dispose();
    subjectSources.add(
      watchSubjectFile(context, uri, (updated) => {
        panel.rpc.emit('subject', updated);
      })
    );

    return subject;
  });

  panel.rpc.onRequest('loadFromGlob', async () => {
    const glob = await context.ask.text({
      prompt: context.l10n.t('Glob pattern, relative to the workspace'),
      placeHolder: 'logs/**/*.log',
      value: '**/*.log',
      validate: (value) =>
        value.trim().length === 0 ? context.l10n.t('Enter a pattern.') : undefined,
    });
    if (glob === undefined) {
      return null;
    }

    const subject = await readGlob(context, glob.trim());
    if (subject === undefined) {
      return null;
    }

    // A glob spans files, so there is no single document to reveal a match in.
    boundDocument = undefined;

    // Unlike the single-file case, this genuinely needs the batching watcher:
    // a rotating log directory produces bursts of events across many paths, and
    // re-reading every file once per burst is the point of the debounce.
    subjectSources.dispose();
    const watcher = context.watchers.watch({
      patterns: glob.trim(),
      ignorePatterns: ['**/node_modules/**', '**/.git/**'],
      debounceDelay: 500,
      maxBatchSize: 200,
    });
    watcher.onDidChange((): void => {
      void (async (): Promise<void> => {
        const updated = await readGlob(context, glob.trim());
        if (updated !== undefined) {
          panel.rpc.emit('subject', updated);
        }
      })();
    });
    subjectSources.add(watcher);

    return subject;
  });

  panel.rpc.onRequest('revealMatch', async ({ index, length }) => {
    if (boundDocument === undefined) {
      return null;
    }
    const document = await vscode.workspace.openTextDocument(boundDocument);
    const editor = await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: true,
    });
    const range = new vscode.Range(
      document.positionAt(index),
      document.positionAt(index + length)
    );
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    return null;
  });

  panel.rpc.onEvent('ready', () => {
    context.logger.debug('Regex tester webview is ready');
  });
}

/** Reads a file as the subject, under a progress notification. */
async function readSubject(
  context: TesterServices,
  uri: vscode.Uri
): Promise<Subject | undefined> {
  return context.operations.run('regexTester.readSubject', (operation) =>
    operation.progress.run(
      { title: context.l10n.t('Loading subject text…'), cancellable: true },
      async (progress, signal) => {
        progress.report({ message: uri.path.split('/').pop() ?? '' });

        const bytes = await vscode.workspace.fs.readFile(uri);
        if (signal.aborted) {
          return undefined;
        }
        return {
          name: uri.path.split('/').pop() ?? context.l10n.t('file'),
          text: new TextDecoder().decode(bytes),
        };
      }
    )
  );
}

/**
 * Files a glob subject will concatenate.
 *
 * The subject is held as one string in the webview and re-scanned on every
 * keystroke, so this is a usability limit as much as a memory one.
 */
const GLOB_FILE_LIMIT = 50;

/**
 * Concatenates every file matching `glob` into one subject.
 *
 * Each file is prefixed with its relative path, so a match found in the tester
 * can be traced back to where it came from.
 */
async function readGlob(context: TesterServices, glob: string): Promise<Subject | undefined> {
  const found = await vscode.workspace.findFiles(glob, '**/node_modules/**', GLOB_FILE_LIMIT);
  if (found.length === 0) {
    await context.notify.warn(context.l10n.t('No files matched that pattern.'));
    return undefined;
  }

  return context.operations.run('regexTester.readGlob', (operation) =>
    operation.progress.run(
      { title: context.l10n.t('Loading subject text…'), cancellable: true },
      async (progress, signal) => {
        const parts: string[] = [];

        for (const [index, uri] of found.entries()) {
          if (signal.aborted) {
            return undefined;
          }
          progress.report({
            message: vscode.workspace.asRelativePath(uri),
            increment: 100 / found.length,
          });
          try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            parts.push(
              `# ${vscode.workspace.asRelativePath(uri)}\n${new TextDecoder().decode(bytes)}`
            );
          } catch (error) {
            // A file that vanished between the scan and the read is not worth
            // failing the whole subject over.
            context.logger.debug('Skipped a file while building a glob subject', {
              index,
              error: String(error),
            });
          }
        }

        return {
          name: context.l10n.plural(parts.length, {
            one: context.l10n.t('{count} file'),
            other: context.l10n.t('{count} files'),
          }),
          text: parts.join('\n\n'),
        };
      }
    )
  );
}

/** Re-reads the subject file when it changes on disk. */
function watchSubjectFile(
  context: TesterServices,
  uri: vscode.Uri,
  onChange: (subject: Subject) => void
): ManagedFileWatcher {
  const watcher = context.watchers.watch({
    patterns: uri.path,
    debounceDelay: 300,
    events: ['change'],
  });

  watcher.onDidChange((): void => {
    void (async (): Promise<void> => {
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        onChange({
          name: uri.path.split('/').pop() ?? context.l10n.t('file'),
          text: new TextDecoder().decode(bytes),
        });
      } catch (error) {
        // The file may have been deleted, or replaced while half-written; the
        // subject already on screen stays as it is.
        context.logger.debug('Could not re-read the subject file', { error: String(error) });
      }
    })();
  });

  return watcher;
}

/** Points at the setting, since raising it is the only real remedy. */
async function warnAboutTimeout(context: TesterServices, timeoutMs: number): Promise<void> {
  const action = await context.notify.warn(
    context.l10n.t('The pattern did not finish within {0}ms and was abandoned.', String(timeoutMs)),
    { actions: [{ title: context.l10n.t('Open setting'), value: 'settings' as const }] }
  );
  if (action === 'settings') {
    await context.commands.execute(
      'workbench.action.openSettings',
      `${EXTENSION_ID}.${CONFIG.REGEX_TIMEOUT}`
    );
  }
}

/** Closes the panel, if open. Called on deactivation. */
export function disposeRegexTester(): void {
  current?.dispose();
  current = undefined;
}
