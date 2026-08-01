/**
 * Regex search-and-replace across the active document.
 *
 * Scanning happens in the regex worker, so a pattern that backtracks forever
 * cannot wedge the editor; the edit is applied as one `WorkspaceEdit`, so it
 * is one undo and one entry in the undo stack's label.
 */

import * as vscode from 'vscode';
import {
  WizardStepError,
  applyWorkspaceEdits,
  getLine,
  getTextInOffsetRange,
  inputStep,
  inputText,
  isCancellation,
  l10n,
  plural,
  quickpickStep,
  resolvePositionsBatch,
  showError,
  showInfo,
  showStatusMessage,
  toAbortSignal,
  toPickItem,
  transformSelection,
  withSteps,
  wizard,
  type Logger,
} from '@kkdev92/vscode-ext-kit';

import { CONFIG, MATCH_CONTEXT_CHARS, REGEX_MATCH_LIMIT } from '../core/constants';
import { translatable } from '../core/i18n';
import { config } from '../core/config';
import { RegexError, compileRegex, expandReplacement, type RegexMatch } from '../lib/regex';
import { RegexTimeoutError, type RegexClient } from '../regex/client';

/** Collaborators the replace command needs. */
export interface ReplaceContext {
  logger: Logger;
  client: RegexClient;
}

/** Optional flags offered in the wizard. `g` is always applied by the scanner. */
const FLAGS = [
  { flag: 'i', label: translatable('Ignore case'), description: 'i' },
  { flag: 'm', label: translatable('Multiline — ^ and $ match line boundaries'), description: 'm' },
  { flag: 's', label: translatable('Dot matches newline'), description: 's' },
  { flag: 'u', label: translatable('Unicode'), description: 'u' },
] as const;

/** Asks for a pattern, flags and replacement, then applies it. */
export async function replaceByPattern(
  context: ReplaceContext,
  editor: vscode.TextEditor
): Promise<void> {
  let answers;
  try {
    answers = await wizard()
      .step(
        'pattern',
        inputStep({
          prompt: l10n.t('Regular expression'),
          placeholder: l10n.t('e.g. (\\w+)@example\\.com'),
          validate: (value) => {
            if (value.length === 0) {
              return l10n.t('Enter a pattern.');
            }
            try {
              compileRegex(value, 'g');
              return undefined;
            } catch (error) {
              return error instanceof RegexError ? error.message : String(error);
            }
          },
        })
      )
      .step(
        'flags',
        quickpickStep({
          canPickMany: true,
          placeholder: l10n.t('Flags (optional)'),
          matchOnDescription: true,
          items: () =>
            FLAGS.map((entry) =>
              toPickItem(entry.flag, {
                label: l10n.t(entry.label),
                description: entry.description,
              })
            ),
        })
      )
      .step(
        'replacement',
        inputStep({
          prompt: l10n.t('Replacement — $1, $<name> and $& are expanded'),
        })
      )
      .run({ title: l10n.t('Replace by Pattern') });
  } catch (error) {
    if (error instanceof WizardStepError) {
      context.logger.error(error, { step: error.atKey });
      await showError(l10n.t('Could not read the replacement options.'));
      return;
    }
    throw error;
  }

  if (!answers.ok) {
    return;
  }

  const { pattern, flags, replacement } = answers.value;
  const document = editor.document;
  const text = document.getText();
  const timeoutMs = config.get(CONFIG.REGEX_TIMEOUT);

  // Non-empty selections narrow the operation; with none, the whole document is
  // in scope.
  const scopes = editor.selections.filter((selection) => !selection.isEmpty);

  const scan = await scanDocument(context, {
    pattern,
    flags: flags.join(''),
    text,
    timeoutMs,
  });
  if (scan === undefined) {
    return;
  }

  const matches = scopes.length === 0 ? scan.matches : withinScopes(document, scan.matches, scopes);

  if (matches.length === 0) {
    await showInfo(l10n.t('No matches.'));
    return;
  }

  const counted = plural(matches.length, {
    one: l10n.t('Replace {count} match?'),
    other: l10n.t('Replace {count} matches?'),
  });
  const proceed = await showInfo(scan.truncated ? `${counted} ${truncatedNote()}` : counted, {
    modal: true,
    detail: preview(editor, matches, replacement),
    actions: [{ title: l10n.t('Replace'), value: 'replace' as const }],
  });
  if (proceed !== 'replace') {
    return;
  }

  // Every match's start and end resolved in one pass, rather than two
  // `positionAt` calls per match.
  const offsets = matches.flatMap((match) => [match.index, match.index + match.text.length]);
  const positions = resolvePositionsBatch(document, offsets);

  const applied = await applyWorkspaceEdits(
    matches.map((match, index) => ({
      uri: document.uri,
      range: new vscode.Range(
        positions[index * 2] as vscode.Position,
        positions[index * 2 + 1] as vscode.Position
      ),
      newText: expandReplacement(replacement, match),
    })),
    { label: l10n.t('Replace by pattern'), isRefactoring: true }
  );

  if (!applied) {
    await showError(l10n.t('The editor rejected the edit. The file may be read-only.'));
    return;
  }

  showStatusMessage(
    `$(replace-all) ${plural(matches.length, {
      one: l10n.t('{count} replacement'),
      other: l10n.t('{count} replacements'),
    })}`,
    2500
  );
}

/**
 * Runs the pattern in the worker behind a cancellable progress notification.
 *
 * @returns The matches, or `undefined` when the user cancelled or the scan
 *   failed — both of which have already been reported to the user.
 */
async function scanDocument(
  context: ReplaceContext,
  request: { pattern: string; flags: string; text: string; timeoutMs: number }
): Promise<{ matches: RegexMatch[]; truncated: boolean } | undefined> {
  try {
    const outcome = await withSteps(
      { title: l10n.t('Replace by Pattern'), cancellable: true },
      {
        label: l10n.t('Scanning'),
        task: (token) =>
          context.client.run(
            {
              pattern: request.pattern,
              flags: request.flags,
              input: request.text,
              limit: REGEX_MATCH_LIMIT,
            },
            request.timeoutMs,
            toAbortSignal(token)
          ),
      }
    );

    // Since kit 2.1.0, a cancellation *during* the scan also comes back as
    // `cancelled: true` — only real failures (an invalid pattern, a timeout)
    // still reject into the catch below.
    const [result] = outcome.results;
    return outcome.cancelled ? undefined : result;
  } catch (error) {
    await reportScanFailure(context, error, request.timeoutMs);
    return undefined;
  }
}

/** Keeps only matches that fall entirely inside one of the selections. */
function withinScopes(
  document: vscode.TextDocument,
  matches: readonly RegexMatch[],
  scopes: readonly vscode.Selection[]
): RegexMatch[] {
  const ranges = scopes.map((scope) => ({
    start: document.offsetAt(scope.start),
    end: document.offsetAt(scope.end),
  }));

  return matches.filter((match) => {
    const end = match.index + match.text.length;
    return ranges.some((range) => match.index >= range.start && end <= range.end);
  });
}

function truncatedNote(): string {
  return l10n.t('(only the first {0} matches were collected)', String(REGEX_MATCH_LIMIT));
}

/**
 * First few before/after pairs with their surroundings, so the modal shows
 * what is about to happen and *where*.
 *
 * A match that sits on one line is shown with that whole line, which is the
 * context a reader actually wants. A match that spans lines has no single line
 * to show, so it falls back to a fixed window of characters either side.
 */
function preview(
  editor: vscode.TextEditor,
  matches: readonly RegexMatch[],
  replacement: string
): string {
  const shown = matches.slice(0, 3);

  const lines = shown.map((match) => {
    const start = editor.document.positionAt(match.index);
    const end = editor.document.positionAt(match.index + match.text.length);

    const context =
      start.line === end.line
        ? getLine(editor, start.line).trim()
        : `…${getTextInOffsetRange(
            editor.document,
            Math.max(0, match.index - MATCH_CONTEXT_CHARS),
            match.index + match.text.length + MATCH_CONTEXT_CHARS
          )}…`;

    return [
      `${l10n.t('Line {0}', String(start.line + 1))}: ${truncate(context, 72)}`,
      `  ${truncate(match.text)} → ${truncate(expandReplacement(replacement, match))}`,
    ].join('\n');
  });

  if (matches.length > shown.length) {
    lines.push('…');
  }
  return lines.join('\n');
}

function truncate(text: string, limit = 60): string {
  const single = text.replace(/\s+/g, ' ');
  return single.length <= limit ? single : `${single.slice(0, limit - 1)}…`;
}

/** Turns a scan failure into advice, since the causes need different fixes. */
async function reportScanFailure(
  context: ReplaceContext,
  error: unknown,
  timeoutMs: number
): Promise<void> {
  if (isCancellation(error)) {
    return;
  }
  if (error instanceof RegexTimeoutError) {
    await showError(
      l10n.t(
        'The pattern did not finish within {0}ms. It is probably backtracking — try anchoring it or making a quantifier less greedy.',
        String(timeoutMs)
      )
    );
    return;
  }
  if (error instanceof RegexError) {
    await showError(error.message);
    return;
  }
  context.logger.error(error);
  await showError(l10n.t('The pattern could not be run.'));
}

/**
 * Replaces the selection with the list of matches found inside it.
 *
 * "Pull every URL out of this blob" is a real five-minute task that otherwise
 * means a throwaway script. Only the primary selection is used: the pattern is
 * asked for once, and turning several selections into several different lists
 * has no obvious meaning — hence `transformSelection` rather than the
 * all-selections variant.
 *
 * When the pattern declares exactly one capture group, that group is extracted
 * instead of the whole match. `href="([^"]+)"` is asked about the URL, not
 * about the attribute around it.
 */
export async function extractMatches(
  context: ReplaceContext,
  editor: vscode.TextEditor
): Promise<void> {
  if (editor.selection.isEmpty) {
    await showError(l10n.t('Select the text to extract from.'));
    return;
  }

  const pattern = await inputText({
    prompt: l10n.t('Regular expression'),
    placeHolder: l10n.t('e.g. https?://\\S+'),
    validate: (value) => {
      if (value.length === 0) {
        return l10n.t('Enter a pattern.');
      }
      try {
        compileRegex(value, 'g');
        return undefined;
      } catch (error) {
        return error instanceof RegexError ? error.message : String(error);
      }
    },
  });
  if (pattern === undefined) {
    return;
  }

  const timeoutMs = config.get(CONFIG.REGEX_TIMEOUT);
  const subject = editor.document.getText(editor.selection);

  let scan;
  try {
    scan = await context.client.run(
      { pattern, flags: '', input: subject, limit: REGEX_MATCH_LIMIT },
      timeoutMs
    );
  } catch (error) {
    await reportScanFailure(context, error, timeoutMs);
    return;
  }

  if (scan.matches.length === 0) {
    await showInfo(l10n.t('No matches.'));
    return;
  }

  const singleGroup = scan.matches.every((match) => match.captures.length === 1);
  const extracted = scan.matches
    .map((match) => (singleGroup ? (match.captures[0] ?? '') : match.text))
    .join('\n');

  // The matching already happened, in the worker; the callback only has to hand
  // back what replaces the selection.
  if (!(await transformSelection(editor, () => extracted))) {
    await showError(l10n.t('The editor rejected the edit. The file may be read-only.'));
    return;
  }

  showStatusMessage(
    `$(list-selection) ${plural(scan.matches.length, {
      one: l10n.t('{count} match extracted'),
      other: l10n.t('{count} matches extracted'),
    })}${scan.truncated ? ` · ${truncatedNote()}` : ''}`,
    2500
  );
}
