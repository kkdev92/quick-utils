/**
 * Extension entry point.
 *
 * Wiring only: every behaviour lives under `src/lib` (pure logic),
 * `src/features` (VS Code-facing) or `src/regex` (the worker).
 *
 * v2 built everything imperatively inside `activate` and pushed each piece onto
 * a disposable list. v3 *declares* it: the module below is a value, the plan
 * compiles at import time — before VS Code is touched — and the host owns every
 * registration through one stop path. Nothing in this file calls a VS Code API.
 */

import {
  FileWatchers,
  Localization,
  Log,
  Operations,
  Secrets,
  StatusBar,
  Webviews,
  defineExtension,
  defineModule,
  serviceToken,
  type ActiveEditor,
  type ApplicationPlan,
  type ManagedWebview,
  type OperationContext,
  type ManagedWebviewPanel,
  type ServiceToken,
  Commands,
} from '@kkdev92/vscode-ext-kit';

import * as vscode from 'vscode';

import { KIT_VERSION } from './core/build';
import * as Cmd from './core/commands';
import { EditorSettings, Settings, resolveJsonIndent } from './core/config';
import { EXTENSION_ID, EXTENSION_NAME, PUBLISHER, REGEX_TESTER_VIEW_TYPE, VIEWS } from './core/constants';
import { uses, type TesterServices } from './core/services';
import {
  DefaultSecret,
  FavoritesStorage,
  HistoryStorage,
  LastTransformStorage,
  LegacyHashAcknowledged,
} from './core/storage';
import { createTransformRegistry, type TransformRegistry } from './core/transforms';
import {
  collectDiagnostics,
  createReportChannel,
  describeDocument,
  reportState,
  type BuildInfo,
  type DiagnosticsContext,
  type ReportChannel,
} from './features/diagnostics';
import {
  convertTimestamp,
  insertDateTime,
  insertLorem,
  insertPassword,
  insertUuidV4,
  insertUuidV7,
} from './features/generate';
import {
  hashSelection,
  hmacSelection,
  hmacWithDefaultSecret,
  manageSecrets,
  setDefaultSecret,
  type HashContext,
} from './features/hash';
import { HistoryStore, HistoryTreeProvider, describeHistoryEntry } from './features/history';
import { registerDecodeHover } from './features/hover';
import {
  JsonStatus,
  SelectionStatus,
  inspectSelection,
  watchInspectTargets,
} from './features/inspect';
import { runPipeline } from './features/pipeline';
import { loadPresets } from './features/presetLoader';
import {
  PRESET_FILE,
  PresetStore,
  insertPreset,
  reloadPresets,
  type PresetContext,
} from './features/presets';
import { disposeRegexTester, initialiseRegexTester, openRegexTester } from './features/regexTester';
import {
  extractMatches,
  replaceByPattern,
  type ReplaceContext,
} from './features/replaceMatches';
import { resolveScratchpad } from './features/scratchpad';
import { FavoritesStore, ToolsTreeProvider } from './features/tools';
import {
  applyTransformById,
  pickAndTransform,
  transformAgain,
  transformClipboard,
  type TransformContext,
} from './features/transform';
import { watchFiles, type WatchContext } from './features/watch';
import { RegexClient, defaultWorkerPath } from './regex/client';
import { TOOLS_DRAG_MIME } from './core/constants';
import type { RegexTesterSchema, ScratchpadSchema } from './webview/protocol';

// ---- Tokens for what this extension provides itself -----------------------

const Registry: ServiceToken<TransformRegistry> =
  serviceToken<TransformRegistry>('quickUtils.registry');
const History: ServiceToken<HistoryStore> = serviceToken<HistoryStore>('quickUtils.history');
const Favorites: ServiceToken<FavoritesStore> =
  serviceToken<FavoritesStore>('quickUtils.favorites');
const Regex: ServiceToken<RegexClient> = serviceToken<RegexClient>('quickUtils.regexClient');
const Report: ServiceToken<ReportChannel> = serviceToken<ReportChannel>('quickUtils.report');
const Build: ServiceToken<BuildInfo> = serviceToken<BuildInfo>('quickUtils.build');
const Tools: ServiceToken<ToolsTreeProvider> =
  serviceToken<ToolsTreeProvider>('quickUtils.toolsProvider');
const HistoryView: ServiceToken<HistoryTreeProvider> =
  serviceToken<HistoryTreeProvider>('quickUtils.historyProvider');
const Presets: ServiceToken<PresetStore> = serviceToken<PresetStore>('quickUtils.presets');
const PresetReload: ServiceToken<() => Promise<void>> =
  serviceToken<() => Promise<void>>('quickUtils.presetReload');


/**
 * This build's version, for the state report.
 *
 * Read from the extension registry rather than from an `ExtensionContext`: the
 * host owns that, and a module declaration never sees one.
 */
function extensionVersion(): string {
  const packaged = vscode.extensions.getExtension(`${PUBLISHER}.${EXTENSION_ID}`);
  return (packaged?.packageJSON as { version?: string } | undefined)?.version ?? 'unknown';
}

const quickUtils = defineModule('quickUtils', { uses }, (module): undefined => {
  // ---- What is persisted, and what is configurable -----------------------

  module.settings.add(Settings);
  module.settings.add(EditorSettings);
  module.storage.add(HistoryStorage);
  module.storage.add(FavoritesStorage);
  module.storage.add(LastTransformStorage);
  module.storage.add(LegacyHashAcknowledged);
  module.secrets.add(DefaultSecret);

  // ---- Services ----------------------------------------------------------

  module.services.singleton(Registry, {
    inject: { config: Settings.token, editorConfig: EditorSettings.token, l10n: Localization },
    create: ({ config, editorConfig, l10n }) =>
      createTransformRegistry({
        jsonIndent: () => resolveJsonIndent(config, editorConfig),
        locale: () => l10n.language,
      }),
  });

  module.services.singleton(History, {
    inject: { storage: HistoryStorage.token, config: Settings.token, log: Log },
    create: ({ storage, config, log }) =>
      new HistoryStore(storage, config, log.withFields({ feature: 'history' })),
  });

  module.services.singleton(Favorites, {
    inject: { storage: FavoritesStorage.token },
    create: ({ storage }) => new FavoritesStore(storage),
  });

  module.services.singleton(Regex, {
    inject: { log: Log },
    create: ({ log }) => new RegexClient(defaultWorkerPath(), log.withFields({ feature: 'regex' })),
  });

  module.services.singleton(Report, () => createReportChannel());

  module.services.singleton(Build, () => ({
    extensionVersion: extensionVersion(),
    kitVersion: KIT_VERSION,
  }));

  module.services.singleton(Presets, () => new PresetStore());

  // The reload closure rather than the loader function: the watcher below, the
  // reload command and activation all have to do the same thing, and binding
  // the store and logger once here is what stops the three of them from
  // drifting into three slightly different loads.
  module.services.singleton(PresetReload, {
    inject: { store: Presets, log: Log },
    create:
      ({ store, log }) =>
      (): Promise<void> =>
        loadPresets(store, log.withFields({ feature: 'presets' })),
  });

  // A service rather than a tree-view local: the checkbox handler and the
  // reset command both drive the same provider.
  module.services.singleton(Tools, {
    inject: { registry: Registry, favorites: Favorites, l10n: Localization, log: Log },
    create: ({ registry, favorites, l10n, log }) =>
      new ToolsTreeProvider(registry, favorites, l10n, log.withFields({ feature: 'tools' })),
  });

  module.services.singleton(HistoryView, {
    inject: { history: History, registry: Registry, config: Settings.token, l10n: Localization },
    create: ({ history, registry, config, l10n }) =>
      new HistoryTreeProvider(history, config, l10n, (entry) =>
        describeHistoryEntry(l10n, registry, entry)
      ),
  });

  // ---- Views -------------------------------------------------------------

  module.treeViews.add({
    id: VIEWS.HISTORY,
    inject: { provider: HistoryView },
    resolveProvider: ({ provider }) => provider,
    options: { showCollapseAll: false },
  });

  module.treeViews.add({
    id: VIEWS.TOOLS,
    inject: { tools: Tools },
    resolveProvider: ({ tools }) => tools,
    options: {
      showCollapseAll: true,
      // Dropping a category row onto Favorites is natural, but the controller
      // only receives ids and a category id maps to no command — those drops
      // are ignored, so the checkbox stays the single way to add a favourite.
      dragAndDrop: {
        mimeType: TOOLS_DRAG_MIME,
        onDrop: () => undefined,
      },
    },
  });

  module.webviews.addView({
    id: VIEWS.SCRATCHPAD,
    inject: { registry: Registry },
    resolve: (view: ManagedWebview<ScratchpadSchema>, { registry, logger, l10n, editors }) => {
      resolveScratchpad({ logger, registry, l10n, editors }, view);
    },
    options: { enableScripts: true },
  });

  module.webviews.restorePanel({
    viewType: REGEX_TESTER_VIEW_TYPE,
    inject: {
      client: Regex,
      webviews: Webviews,
      operations: Operations,
      watchers: FileWatchers,
      commands: Commands,
    },
    restore: async (
      panel: ManagedWebviewPanel<RegexTesterSchema>,
      _state: unknown,
      injected: TesterServices
    ) => {
      // The webview restores its own pattern and subject from setState/getState,
      // so nothing has to be replayed from here.
      await initialiseRegexTester(injected, panel);
    },
  });

  // ---- Status indicators -------------------------------------------------

  module.statusBar.add(SelectionStatus);
  module.languageStatus.add(JsonStatus);

  // ---- Background wiring -------------------------------------------------

  // A glob known when this line is written, so it is declared rather than
  // started at runtime: the host binds it at activation, runs the handler in an
  // operation, and tears it down with the module. `FileWatchers.watch` is for
  // the other case — see the watch command below, where the user types the
  // pattern.
  module.fileWatchers.add({
    id: 'quickUtils.presetFile',
    patterns: `**/${PRESET_FILE}`,
    // The file is edited by hand, so changes arrive in bursts of keystroke
    // saves. Reloading once after they settle is the point.
    debounceDelay: 400,
    inject: { reload: PresetReload },
    handle: async (_operation, _events, { reload }) => {
      await reload();
    },
  });

  // Presets have to exist before the first command asks for them, and a watcher
  // only reports *changes* — a file that was already there when the window
  // opened never fires.
  module.hostedServices.add({
    id: 'quickUtils.presetLoad',
    inject: { reload: PresetReload },
    start: async (context, { reload }) => {
      await reload();

      // An untrusted window reads no preset file at all (see `presetLoader.ts`),
      // and being re-activated when trust arrives is not something this
      // extension can count on: VS Code restarts the extension host only when
      // some extension's *enablement* changes, and this one declared
      // `untrustedWorkspaces.supported`, so it was already enabled and its
      // enablement does not change. It restarts only if some other installed
      // extension happens to flip. This event is the guaranteed signal.
      const granted = vscode.workspace.onDidGrantWorkspaceTrust(() => {
        void reload();
      });
      context.signal.addEventListener('abort', () => {
        granted.dispose();
      });
    },
  });

  // The one place this extension reaches past the framework, declared so it is
  // visible in the plan and released with the module. See `hover.ts` for why a
  // hover provider is the case that earns it.
  module.raw.register({
    id: 'quickUtils.decodeHover',
    // No `inject`: the module's ambient set already carries `l10n` and
    // `logger`, and naming either again is a definition-time error rather than
    // a shadowing rule.
    bind: ({ registrations }, { l10n, logger }): undefined => {
      registrations.own(registerDecodeHover(l10n, logger.withFields({ feature: 'hover' })));
      return undefined;
    },
  });

  module.hostedServices.add({
    id: 'quickUtils.inspect',
    inject: {
      selectionStatus: SelectionStatus.token,
      jsonStatus: JsonStatus.token,
    },
    start: (context, injected) => {
      const watcher = watchInspectTargets(injected);
      context.signal.addEventListener('abort', () => {
        watcher.dispose();
      });
    },
  });

  module.hostedServices.add({
    id: 'quickUtils.favoritesCheckbox',
    inject: { tools: Tools, log: Log },
    start: (context, { tools, log }) => {
      const subscription = tools.onDidChangeCheckboxState((changes) => {
        void (async (): Promise<void> => {
          for (const change of changes) {
            const commandId = change.item.data?.command;
            if (commandId !== undefined) {
              await tools.setFavorite(commandId, change.checked);
            }
          }
        })().catch((error: unknown) => {
          log.error('Could not update favorites', error);
        });
      });
      context.signal.addEventListener('abort', () => {
        subscription.dispose();
      });
    },
  });

  // ---- Commands ----------------------------------------------------------

  /** What each family of features needs beyond the module's own set. */
  const transforming = {
    registry: Registry,
    history: History,
    lastTransform: LastTransformStorage.token,
    status: StatusBar,
  } as const;
  const generating = { history: History, status: StatusBar } as const;
  const hashing = {
    history: History,
    secrets: Secrets,
    defaultSecret: DefaultSecret.token,
    legacyAcknowledged: LegacyHashAcknowledged.token,
    status: StatusBar,
  } as const;
  const testing = {
    client: Regex,
    status: StatusBar,
    webviews: Webviews,
    operations: Operations,
    watchers: FileWatchers,
    commands: Commands,
  } as const;
  const reporting = { history: History, secrets: Secrets, report: Report, build: Build } as const;

  /**
   * Binds an editor feature to the dependencies its context is made of.
   *
   * The injected bag *is* the context — the module's ambient set plus whatever
   * is named here. There is nothing left to assemble, which is what the five
   * bundling services used to do.
   */
  const onEditor = <TDeps extends Record<string, ServiceToken<unknown>>, TContext>(
    inject: TDeps,
    run: (context: TContext, editor: ActiveEditor) => Promise<void> | void
  ): {
    inject: TDeps;
    execute: (
      operation: OperationContext,
      editor: ActiveEditor,
      args: readonly [],
      injected: TContext
    ) => Promise<void>;
  } => ({
    inject,
    execute: async (_operation, editor, _args, injected): Promise<void> => {
      await run(injected, editor);
    },
  });

  module.commands.handleTextEditor(Cmd.Transform, onEditor(transforming, pickAndTransform));
  module.commands.handleTextEditor(Cmd.TransformAgain, onEditor(transforming, transformAgain));
  module.commands.handleTextEditor(Cmd.TransformPipeline, onEditor(transforming, runPipeline));

  /** Binds a per-transform command to its registry id. */
  const transformCommand = (contract: (typeof Cmd)['UpperCase'], id: string): undefined => {
    module.commands.handleTextEditor(
      contract,
      onEditor(transforming, (context: TransformContext, editor) =>
        applyTransformById(context, editor, id)
      )
    );
    return undefined;
  };

  transformCommand(Cmd.UpperCase, 'case.upper');
  transformCommand(Cmd.LowerCase, 'case.lower');
  transformCommand(Cmd.CamelCase, 'case.camel');
  transformCommand(Cmd.PascalCase, 'case.pascal');
  transformCommand(Cmd.SnakeCase, 'case.snake');
  transformCommand(Cmd.KebabCase, 'case.kebab');
  transformCommand(Cmd.ConstantCase, 'case.constant');
  transformCommand(Cmd.TitleCase, 'case.title');
  transformCommand(Cmd.Base64Encode, 'codec.base64Encode');
  transformCommand(Cmd.Base64Decode, 'codec.base64Decode');
  transformCommand(Cmd.UrlEncode, 'codec.urlEncode');
  transformCommand(Cmd.UrlDecode, 'codec.urlDecode');
  transformCommand(Cmd.SortLines, 'lines.sortAscending');
  transformCommand(Cmd.DedupeLines, 'lines.dedupe');
  transformCommand(Cmd.JsonFormat, 'json.format');
  transformCommand(Cmd.JsonMinify, 'json.minify');
  transformCommand(Cmd.JsonSortKeys, 'json.sortKeys');

  module.commands.handleTextEditor(Cmd.GenerateUuid, onEditor(generating, insertUuidV4));
  module.commands.handleTextEditor(Cmd.GenerateUuidV7, onEditor(generating, insertUuidV7));
  module.commands.handleTextEditor(Cmd.GeneratePassword, onEditor(generating, insertPassword));
  module.commands.handleTextEditor(Cmd.GenerateLorem, onEditor(generating, insertLorem));
  module.commands.handleTextEditor(Cmd.InsertDate, onEditor(generating, insertDateTime));
  module.commands.handleTextEditor(Cmd.ConvertTimestamp, onEditor(generating, convertTimestamp));

  module.commands.handleTextEditor(Cmd.Hash, onEditor(hashing, hashSelection));
  module.commands.handleTextEditor(Cmd.Hmac, onEditor(hashing, hmacSelection));
  module.commands.handleTextEditor(Cmd.HmacDefault, onEditor(hashing, hmacWithDefaultSecret));
  module.commands.handleTextEditor(Cmd.Inspect, onEditor({}, inspectSelection));
  module.commands.handleTextEditor(Cmd.InspectDocument, onEditor(reporting, describeDocument));

  // The one context injection cannot finish on its own: progress belongs to the
  // operation, not to the container.
  module.commands.handleTextEditor(Cmd.ReplaceMatches, {
    inject: testing,
    execute: (operation, editor, _args, injected: Omit<ReplaceContext, 'progress'>) =>
      replaceByPattern({ ...injected, progress: operation.progress }, editor),
  });

  module.commands.handleTextEditor(Cmd.ExtractMatches, {
    inject: testing,
    execute: (operation, editor, _args, injected: Omit<ReplaceContext, 'progress'>) =>
      extractMatches({ ...injected, progress: operation.progress }, editor),
  });

  module.commands.handle(Cmd.TransformClipboard, {
    inject: transforming,
    execute: (_operation, _args, context: TransformContext) => transformClipboard(context),
  });

  module.commands.handle(Cmd.ManageSecrets, {
    inject: hashing,
    execute: (_operation, _args, context: HashContext) => manageSecrets(context),
  });

  module.commands.handle(Cmd.SetDefaultSecret, {
    inject: hashing,
    execute: (_operation, _args, context: HashContext) => setDefaultSecret(context),
  });

  module.commands.handle(Cmd.OpenRegexTester, {
    inject: testing,
    execute: (_operation, _args, context: TesterServices) => openRegexTester(context),
  });

  module.commands.handle(Cmd.ReportState, {
    inject: reporting,
    execute: (_operation, _args, context: DiagnosticsContext) => reportState(context),
  });

  module.commands.handle(Cmd.CollectDiagnostics, {
    inject: reporting,
    execute: (_operation, _args, context: DiagnosticsContext) => collectDiagnostics(context),
  });

  module.commands.handle(Cmd.HistoryClear, {
    inject: { history: History, view: HistoryView, status: StatusBar },
    execute: async (_operation, _args, { notify, l10n, history, view, status }) => {
      const confirmed = await notify.confirm(l10n.t('Clear the operation history?'), {
        detail: l10n.t('This cannot be undone.'),
        yesText: l10n.t('Clear'),
      });
      if (confirmed) {
        await history.clear();
        view.resetPaging();
        status.flash('$(check) ' + l10n.t('History cleared'), 2000);
      }
    },
  });

  module.commands.handle(Cmd.HistoryLoadMore, {
    inject: { view: HistoryView },
    execute: (_operation, _args, { view }) => {
      view.loadMore();
    },
  });

  module.commands.handle(Cmd.HistoryCopy, {
    inject: { status: StatusBar },
    execute: async (_operation, [item], { notify, l10n, status }) => {
      const output = item.data?.output;
      if (output === undefined) {
        await notify.error(l10n.t('That entry has no recorded output.'));
        return;
      }
      await vscode.env.clipboard.writeText(output);
      status.flash('$(clippy) ' + l10n.t('Copied'), 1500);
    },
  });

  module.commands.handle(Cmd.HistoryReapply, {
    inject: transforming,
    execute: async (_operation, [item], context: TransformContext) => {
      const editor = context.editors.active;
      if (editor === undefined) {
        await context.notify.error(context.l10n.t('Open a file first — there is no active editor.'));
        return;
      }
      const id = item.data?.id;
      if (id === undefined || !context.registry.has(id)) {
        await context.notify.error(context.l10n.t('That operation cannot be applied again.'));
        return;
      }
      await applyTransformById(context, editor, id);
    },
  });

  module.commands.handle(Cmd.ToolsResetFavorites, {
    inject: { favorites: Favorites, tools: Tools },
    execute: async (_operation, _args, { notify, l10n, favorites, tools }) => {
      const confirmed = await notify.confirm(l10n.t('Remove all favorites?'), {
        severity: 'info',
        yesText: l10n.t('Remove'),
      });
      if (confirmed) {
        await favorites.reset();
        // Removes the (now empty) Favorites group; expanded categories survive.
        tools.syncFavorites();
      }
    },
  });

  // ---- Workspace presets -------------------------------------------------

  const presetContext = { presets: Presets, reload: PresetReload, status: StatusBar } as const;

  module.commands.handleTextEditor(Cmd.InsertPreset, {
    inject: presetContext,
    execute: (_operation, editor, _args, injected: PresetContext) =>
      insertPreset(injected, editor),
  });

  module.commands.handle(Cmd.ReloadPresets, {
    inject: presetContext,
    execute: (_operation, _args, injected: PresetContext) => reloadPresets(injected),
  });

  module.commands.handle(Cmd.WatchFiles, {
    inject: { watchers: FileWatchers, status: StatusBar },
    execute: (operation, _args, injected: WatchContext) => watchFiles(injected, operation),
  });

  return undefined;
});

const app = defineExtension({ name: EXTENSION_NAME, modules: [quickUtils] });

/**
 * The compiled plan, for tests that run the application rather than the bundle.
 *
 * `createTestHost` binds this exact plan to fakes, so a test can start the whole
 * thing without VS Code. Exporting it is what makes that possible — and it is
 * the plan `activate` uses, so there is no second, test-shaped definition to
 * keep in step with this one.
 */
export const plan: ApplicationPlan = app.plan;

export const activate = app.activate;

export async function deactivate(): Promise<void> {
  disposeRegexTester();
  await app.deactivate();
}
