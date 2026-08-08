/**
 * Snippets a project carries with it.
 *
 * Every team ends up with a handful of strings nobody can remember: a licence
 * header, a `docker run` line, the shape of a bug report. They belong to the
 * repository rather than to whoever happened to type them, so they live in a
 * `.quick-utils.json` at the workspace root and travel with a clone.
 *
 * Two things about the file are worth stating up front, because they shape the
 * code below:
 *
 * - **A malformed file is expected.** It is edited by hand, often by someone
 *   who is not the person who will next run a command. So parsing returns a
 *   `Result` rather than throwing, and the store keeps the last version that
 *   parsed. Losing a working set of snippets because of a stray comma would be
 *   a worse failure than the typo it reports.
 * - **It changes while the editor is open.** Pulling a branch rewrites it. A
 *   declared file watcher reloads it, so nobody has to know a reload command
 *   exists — the one that does exist is for the case where you want to be sure.
 */

import {
  err,
  ok,
  s,
  toPickItem,
  validateSchema,
  type ActiveEditor,
  type Result,
  type StatusBarService,
} from '@kkdev92/vscode-ext-kit';

import type { Services } from '../core/services';

/** Where a workspace keeps its shared snippets. */
export const PRESET_FILE = '.quick-utils.json';

/** One named snippet. */
export interface Preset {
  readonly name: string;
  readonly body: string;
  readonly description?: string | undefined;
}

/**
 * The file, without its snippets.
 *
 * Split from the snippet schema on purpose. `s.array` stops at the first item
 * that fails, which is the right economy for a value arriving over a wire and
 * the wrong one for a file a person is editing: they are looking at all of it,
 * and a parser that reveals one mistake per save wastes their afternoon. So the
 * envelope is validated here and each snippet separately below, which is what
 * lets every bad entry be named at once.
 */
const EnvelopeSchema = s.object({ snippets: s.array(s.unknown()) });

/**
 * One snippet.
 *
 * Deliberately small. A preset file that grows a template language is a
 * template language nobody asked this extension to maintain; `body` is text,
 * inserted as written.
 */
const SnippetSchema = s.object({
  name: s.string({ minLength: 1 }),
  body: s.string(),
  description: s.optional(s.string()),
});

/** Renders one schema issue with the path that located it. */
function describeIssue(prefix: string, issue: { message: string; path?: readonly unknown[] }): string {
  const path = (issue.path ?? []).map((segment) => String(segment)).join('.');
  return path === '' ? `${prefix}: ${issue.message}` : `${prefix}.${path}: ${issue.message}`;
}

/** Parses the file's text, naming every problem it has rather than the first. */
export function parsePresets(text: string): Result<readonly Preset[], readonly string[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return err([error instanceof Error ? error.message : String(error)]);
  }

  const envelope = validateSchema(EnvelopeSchema, parsed);
  if ('issues' in envelope) {
    return err(envelope.issues.map((issue) => describeIssue('snippets', issue)));
  }

  const issues: string[] = [];
  const presets: Preset[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of envelope.value.snippets.entries()) {
    const result = validateSchema(SnippetSchema, entry);
    if ('issues' in result) {
      issues.push(...result.issues.map((issue) => describeIssue(`snippets[${index}]`, issue)));
      continue;
    }
    // Not a schema concern — the schema sees a list of valid objects. But two
    // snippets with one name make the picker ambiguous, and silently keeping
    // whichever came last is the sort of thing that gets blamed on the picker.
    if (seen.has(result.value.name)) {
      issues.push(`snippets[${index}]: duplicate snippet name "${result.value.name}"`);
      continue;
    }
    seen.add(result.value.name);
    presets.push(result.value);
  }

  return issues.length > 0 ? err(issues) : ok(presets);
}

/**
 * Holds what the workspace's preset file most recently said.
 *
 * A service rather than a module-level variable because two commands and a
 * watcher all read the same set, and because a test can then hand a feature its
 * own store instead of a file.
 */
export class PresetStore {
  private _presets: readonly Preset[] = [];
  private _issues: readonly string[] = [];
  private _loadedFrom: string | undefined;

  /** The presets currently in effect — the last text that parsed. */
  get presets(): readonly Preset[] {
    return this._presets;
  }

  /** What was wrong with the most recent load, if anything. */
  get issues(): readonly string[] {
    return this._issues;
  }

  /** Which file the presets in effect came from. */
  get loadedFrom(): string | undefined {
    return this._loadedFrom;
  }

  /**
   * Applies a load result.
   *
   * On failure the presets already in effect stay in effect. The file is being
   * edited, so it spends time in a broken state on purpose; dropping the last
   * good set at the first unbalanced brace would make every save a hazard.
   */
  apply(from: string, outcome: Result<readonly Preset[], readonly string[]>): void {
    if (outcome.ok) {
      this._presets = outcome.value;
      this._issues = [];
      this._loadedFrom = from;
      return;
    }
    this._issues = outcome.error;
  }

  /** Forgets everything, for a workspace that no longer has a preset file. */
  clear(): void {
    this._presets = [];
    this._issues = [];
    this._loadedFrom = undefined;
  }
}

/** What the preset commands need beyond the module's ambient set. */
export interface PresetContext extends Services {
  readonly presets: PresetStore;
  readonly reload: () => Promise<void>;
  readonly status: StatusBarService;
}

/**
 * Inserts a chosen snippet at the cursor.
 *
 * @example
 * ```ts
 * module.commands.handleTextEditor(Cmd.InsertPreset, {
 *   inject: { presets: Presets, reload: PresetReloader },
 *   execute: (_operation, editor, _args, injected) => insertPreset(injected, editor),
 * });
 * ```
 */
export async function insertPreset(context: PresetContext, editor: ActiveEditor): Promise<void> {
  if (context.presets.presets.length === 0) {
    await context.notify.info(
      context.l10n.t('No snippets yet. Add a {0} to this workspace.', PRESET_FILE)
    );
    return;
  }

  const chosen = await context.ask.one(
    context.presets.presets.map((preset) =>
      toPickItem(preset, {
        label: preset.name,
        ...(preset.description === undefined ? {} : { description: preset.description }),
        // The first line stands in for the body: a picker showing a licence
        // header in full is a picker you scroll past.
        detail: preset.body.split('\n')[0] ?? '',
      })
    ),
    { placeHolder: context.l10n.t('Select a snippet to insert') }
  );
  if (chosen === undefined) {
    return;
  }

  await editor.insertAtCursor(chosen.value.body);
  context.logger.debug('preset inserted', { name: chosen.value.name });
}

/**
 * Reloads the file and says what happened.
 *
 * The watcher reloads silently — reporting a syntax error on every keystroke of
 * an edit in progress would be noise. This is the deliberate one, so it answers
 * either way.
 */
export async function reloadPresets(context: PresetContext): Promise<void> {
  await context.reload();

  const { issues, presets, loadedFrom } = context.presets;
  if (issues.length > 0) {
    await context.notify.error(
      context.l10n.t('{0} could not be read: {1}', PRESET_FILE, issues.join('; '))
    );
    return;
  }
  if (loadedFrom === undefined) {
    await context.notify.info(context.l10n.t('No {0} in this workspace.', PRESET_FILE));
    return;
  }
  context.status.flash(
    `$(check) ${context.l10n.t('{0} snippets loaded', String(presets.length))}`,
    2000
  );
}
