/**
 * Extension entry point.
 *
 * Wiring only: every behaviour lives under `src/lib` (pure logic),
 * `src/features` (VS Code-facing) or `src/regex` (the worker). Keeping this
 * file declarative is what makes the rest testable without an extension host.
 */

import * as vscode from 'vscode';
import {
  confirm,
  createExtensionKit,
  createScope,
  createTreeView,
  createWorkspaceStorage,
  getLanguage,
  l10n,
  plural,
  s,
  showError,
  showStatusMessage,
  type CommandHandler,
  type TextEditorCommandHandler,
} from '@kkdev92/vscode-ext-kit';

import { KIT_VERSION } from './core/build';
import { config, resolveJsonIndent, tabSize } from './core/config';
import { COMMANDS, CONFIG, EXTENSION_NAME, STORAGE, VIEWS, type CommandId } from './core/constants';
import { createTransformRegistry } from './core/transforms';
import { transformIdSchema } from './core/types';
import { registerDiagnostics, type DiagnosticsCommandId } from './features/diagnostics';
import {
  convertTimestamp,
  insertDateTime,
  insertLorem,
  insertPassword,
  insertUuidV4,
  insertUuidV7,
} from './features/generate';
import {
  createDefaultSecretStorage,
  createHmacSecretStore,
  hashSelection,
  hmacSelection,
  hmacWithDefaultSecret,
  manageSecrets,
  setDefaultSecret,
} from './features/hash';
import {
  HistoryStore,
  HistoryTreeProvider,
  describeHistoryEntry,
  type HistoryItem,
} from './features/history';
import { InspectFeature, inspectSelection } from './features/inspect';
import {
  disposeRegexTester,
  openRegexTester,
  registerRegexTesterSerializer,
} from './features/regexTester';
import { registerScratchpad } from './features/scratchpad';
import { runPipeline } from './features/pipeline';
import { extractMatches, replaceByPattern } from './features/replaceMatches';
import { FavoritesStore, ToolsTreeProvider, createToolsDragAndDrop } from './features/tools';
import {
  applyTransformById,
  pickAndTransform,
  transformAgain,
  transformClipboard,
} from './features/transform';
import { RegexClient, defaultWorkerPath } from './regex/client';

/**
 * Commands that require an open editor.
 *
 * Registering them as text editor commands means VS Code enables them only
 * when an editor has focus and hands the editor to the handler, so none of
 * them needs its own "is there an editor?" check.
 */
type EditorCommandId =
  | typeof COMMANDS.TRANSFORM
  | typeof COMMANDS.TRANSFORM_AGAIN
  | typeof COMMANDS.TRANSFORM_PIPELINE
  | typeof COMMANDS.REPLACE_MATCHES
  | typeof COMMANDS.EXTRACT_MATCHES
  | typeof COMMANDS.UPPER_CASE
  | typeof COMMANDS.LOWER_CASE
  | typeof COMMANDS.CAMEL_CASE
  | typeof COMMANDS.PASCAL_CASE
  | typeof COMMANDS.SNAKE_CASE
  | typeof COMMANDS.KEBAB_CASE
  | typeof COMMANDS.CONSTANT_CASE
  | typeof COMMANDS.TITLE_CASE
  | typeof COMMANDS.BASE64_ENCODE
  | typeof COMMANDS.BASE64_DECODE
  | typeof COMMANDS.URL_ENCODE
  | typeof COMMANDS.URL_DECODE
  | typeof COMMANDS.SORT_LINES
  | typeof COMMANDS.DEDUPE_LINES
  | typeof COMMANDS.JSON_FORMAT
  | typeof COMMANDS.JSON_MINIFY
  | typeof COMMANDS.JSON_SORT_KEYS
  | typeof COMMANDS.GENERATE_UUID
  | typeof COMMANDS.GENERATE_UUID_V7
  | typeof COMMANDS.GENERATE_PASSWORD
  | typeof COMMANDS.GENERATE_LOREM
  | typeof COMMANDS.INSERT_DATE
  | typeof COMMANDS.CONVERT_TIMESTAMP
  | typeof COMMANDS.HASH
  | typeof COMMANDS.HMAC
  | typeof COMMANDS.HMAC_DEFAULT
  | typeof COMMANDS.INSPECT;

/**
 * Everything else, minus what the diagnostics feature registers itself.
 *
 * Derived rather than listed, so the `Record<PlainCommandId, …>` below fails to
 * compile if a command is added to {@link COMMANDS} and never registered — the
 * three command sets between them still have to cover the union exactly.
 */
type PlainCommandId = Exclude<CommandId, EditorCommandId | DiagnosticsCommandId>;

export function activate(context: vscode.ExtensionContext): void {
  // The kit owns the logger and a disposable scope, and registers itself in
  // context.subscriptions — everything added below is torn down with it.
  const kit = createExtensionKit<CommandId>(context, EXTENSION_NAME, {
    logger: { level: config.get(CONFIG.LOG_LEVEL) },
  });
  const { logger } = kit;

  const undeclared = config.checkPackageJsonSync(context);
  if (undeclared.length > 0) {
    logger.warn('Settings declared in the config schema but missing from package.json', {
      keys: undeclared.join(', '),
    });
  }

  kit.disposables.push(
    tabSize,
    // The level arrives schema-validated, unlike the logger's own
    // `configSection` re-read.
    config.onDidChange(CONFIG.LOG_LEVEL, (level) => {
      logger.setLevel(level);
    }),
    // Surface a setting that fails validation as soon as it is edited, rather
    // than silently serving the default until someone wonders why.
    config.onDidChangeAny(() => {
      for (const key of Object.values(CONFIG)) {
        const result = config.tryGet(key);
        if (!result.ok) {
          logger.warn('Setting failed validation; using the default', {
            key,
            issues: result.error.map((issue) => issue.message).join('; '),
          });
        }
      }
    })
  );

  const registry = createTransformRegistry({
    jsonIndent: resolveJsonIndent,
    locale: getLanguage,
  });

  const history = new HistoryStore(context, logger.child('history'));
  const lastTransform = createWorkspaceStorage<string | undefined>(
    context,
    STORAGE.LAST_TRANSFORM,
    {
      defaultValue: undefined,
      // A stored id whose transform has since been removed reads back as unset,
      // so "Apply Again" says "run a transform first" instead of failing.
      schema: s.optional(transformIdSchema((id) => registry.has(id))),
    }
  );
  const favorites = new FavoritesStore(context);
  const secrets = createHmacSecretStore(context);
  const defaultSecret = createDefaultSecretStorage(context);
  const client = new RegexClient(defaultWorkerPath(), logger.child('regex'));

  kit.disposables.push(history, lastTransform, favorites, secrets, defaultSecret, {
    dispose: () => {
      client.dispose();
    },
  });

  // The default key can be set from another window; noting it here is what
  // makes "why did signing start working?" answerable from the log.
  kit.disposables.push(
    defaultSecret.onDidChange(() => {
      logger.info('Default signing key changed');
    })
  );

  // ---- Views -------------------------------------------------------------

  const views = createScope(context);

  const historyProvider = new HistoryTreeProvider(history, (entry) =>
    describeHistoryEntry(registry, entry)
  );
  const historyView = createTreeView(context, VIEWS.HISTORY, historyProvider, {
    showCollapseAll: false,
  });

  const toolsProvider = new ToolsTreeProvider(registry, favorites, logger.child('tools'));
  const toolsView = createTreeView(context, VIEWS.TOOLS, toolsProvider, {
    showCollapseAll: true,
    dragAndDropController: createToolsDragAndDrop(toolsProvider),
  });

  const updateBadge = (): void => {
    const count = history.count;
    historyView.badge =
      count === 0
        ? undefined
        : {
            value: count,
            tooltip: plural(count, {
              one: l10n.t('{count} recorded operation'),
              other: l10n.t('{count} recorded operations'),
            }),
          };
  };
  updateBadge();

  views.push(
    historyProvider,
    historyView,
    toolsProvider,
    toolsView,
    history.onDidChange(updateBadge),
    toolsProvider.onDidChangeCheckboxState((changes) => {
      void kit.run('Update favorites', async () => {
        for (const change of changes) {
          const commandId = change.item.data?.command;
          if (commandId !== undefined) {
            await toolsProvider.setFavorite(commandId, change.checked);
          }
        }
      });
    })
  );

  kit.disposables.push(new InspectFeature());

  // ---- Commands ----------------------------------------------------------

  const transformContext = { logger: logger.child('transform'), registry, history, lastTransform };
  const generateContext = { logger: logger.child('generate'), history };
  const hashContext = {
    logger: logger.child('hash'),
    history,
    secrets,
    defaultSecret,
    globalState: context.globalState,
  };
  const regexContext = { context, logger: logger.child('regexTester'), client };
  const replaceContext = { logger: logger.child('replace'), client };

  kit.disposables.push(
    registerRegexTesterSerializer(regexContext),
    registerScratchpad({ context, logger: logger.child('scratchpad'), registry }),
    // Owns its own output channel and registers its own commands, so a failure
    // while producing a diagnostic lands in the diagnostic channel.
    registerDiagnostics({ context, history, secrets, kitVersion: KIT_VERSION })
  );

  /** Binds a per-transform command to its registry id. */
  const transformCommand =
    (id: string): TextEditorCommandHandler =>
    (editor) =>
      applyTransformById(transformContext, editor, id);

  const editorCommands: Record<EditorCommandId, TextEditorCommandHandler> = {
    [COMMANDS.TRANSFORM]: (editor) => pickAndTransform(transformContext, editor),
    [COMMANDS.TRANSFORM_AGAIN]: (editor) => transformAgain(transformContext, editor),
    [COMMANDS.TRANSFORM_PIPELINE]: (editor) => runPipeline(transformContext, editor),
    [COMMANDS.REPLACE_MATCHES]: (editor) => replaceByPattern(replaceContext, editor),
    [COMMANDS.EXTRACT_MATCHES]: (editor) => extractMatches(replaceContext, editor),

    [COMMANDS.UPPER_CASE]: transformCommand('case.upper'),
    [COMMANDS.LOWER_CASE]: transformCommand('case.lower'),
    [COMMANDS.CAMEL_CASE]: transformCommand('case.camel'),
    [COMMANDS.PASCAL_CASE]: transformCommand('case.pascal'),
    [COMMANDS.SNAKE_CASE]: transformCommand('case.snake'),
    [COMMANDS.KEBAB_CASE]: transformCommand('case.kebab'),
    [COMMANDS.CONSTANT_CASE]: transformCommand('case.constant'),
    [COMMANDS.TITLE_CASE]: transformCommand('case.title'),

    [COMMANDS.BASE64_ENCODE]: transformCommand('codec.base64Encode'),
    [COMMANDS.BASE64_DECODE]: transformCommand('codec.base64Decode'),
    [COMMANDS.URL_ENCODE]: transformCommand('codec.urlEncode'),
    [COMMANDS.URL_DECODE]: transformCommand('codec.urlDecode'),

    [COMMANDS.SORT_LINES]: transformCommand('lines.sortAscending'),
    [COMMANDS.DEDUPE_LINES]: transformCommand('lines.dedupe'),

    [COMMANDS.JSON_FORMAT]: transformCommand('json.format'),
    [COMMANDS.JSON_MINIFY]: transformCommand('json.minify'),
    [COMMANDS.JSON_SORT_KEYS]: transformCommand('json.sortKeys'),

    [COMMANDS.GENERATE_UUID]: (editor) => insertUuidV4(generateContext, editor),
    [COMMANDS.GENERATE_UUID_V7]: (editor) => insertUuidV7(generateContext, editor),
    [COMMANDS.GENERATE_PASSWORD]: (editor) => insertPassword(generateContext, editor),
    [COMMANDS.GENERATE_LOREM]: (editor) => insertLorem(generateContext, editor),
    [COMMANDS.INSERT_DATE]: (editor) => insertDateTime(generateContext, editor),
    [COMMANDS.CONVERT_TIMESTAMP]: (editor) => convertTimestamp(generateContext, editor),

    [COMMANDS.HASH]: (editor) => hashSelection(hashContext, editor),
    [COMMANDS.HMAC]: (editor) => hmacSelection(hashContext, editor),
    [COMMANDS.HMAC_DEFAULT]: (editor) => hmacWithDefaultSecret(hashContext, editor),

    [COMMANDS.INSPECT]: (editor) => inspectSelection(editor),
  };

  const plainCommands: Record<PlainCommandId, CommandHandler> = {
    [COMMANDS.TRANSFORM_CLIPBOARD]: () => transformClipboard(transformContext),
    [COMMANDS.MANAGE_SECRETS]: () => manageSecrets(hashContext),
    [COMMANDS.SET_DEFAULT_SECRET]: () => setDefaultSecret(hashContext),
    [COMMANDS.OPEN_REGEX_TESTER]: () => openRegexTester(regexContext),

    [COMMANDS.HISTORY_CLEAR]: async () => {
      const confirmed = await confirm(l10n.t('Clear the operation history?'), {
        detail: l10n.t('This cannot be undone.'),
        yesText: l10n.t('Clear'),
      });
      if (confirmed) {
        await history.clear();
        historyProvider.resetPaging();
        showStatusMessage(`$(check) ${l10n.t('History cleared')}`, 2000);
      }
    },
    [COMMANDS.HISTORY_LOAD_MORE]: () => {
      historyProvider.loadMore();
    },
    [COMMANDS.HISTORY_COPY]: async (item: HistoryItem) => {
      const output = item.data?.output;
      if (output === undefined) {
        await showError(l10n.t('That entry has no recorded output.'));
        return;
      }
      await vscode.env.clipboard.writeText(output);
      showStatusMessage(`$(clippy) ${l10n.t('Copied')}`, 1500);
    },
    [COMMANDS.HISTORY_REAPPLY]: async (item: HistoryItem) => {
      const editor = vscode.window.activeTextEditor;
      if (editor === undefined) {
        await showError(l10n.t('Open a file first — there is no active editor.'));
        return;
      }
      const id = item.data?.id;
      if (id === undefined || !registry.has(id)) {
        await showError(l10n.t('That operation cannot be applied again.'));
        return;
      }
      await applyTransformById(transformContext, editor, id);
    },

    [COMMANDS.TOOLS_RESET_FAVORITES]: async () => {
      const confirmed = await confirm(l10n.t('Remove all favorites?'), {
        severity: 'info',
        yesText: l10n.t('Remove'),
      });
      if (confirmed) {
        await favorites.reset();
        // Removes the (now empty) Favorites group; expanded categories survive.
        toolsProvider.syncFavorites();
      }
    },
  };

  kit.registerTextEditorCommands(editorCommands);
  kit.registerCommands(plainCommands);

  logger.info('Activated', {
    transforms: registry.all.length,
    commands: Object.keys(editorCommands).length + Object.keys(plainCommands).length,
    kit: KIT_VERSION,
  });
}

export function deactivate(): void {
  // The kit disposes everything registered through it via
  // context.subscriptions; only the singleton panel is held outside that.
  disposeRegexTester();
}
