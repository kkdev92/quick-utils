/**
 * The services a feature is handed.
 *
 * v2 reached the kit's helpers by importing them — `showError(...)`,
 * `pickOne(...)`, `l10n.t(...)` were module-level functions backed by whatever
 * VS Code happened to be around. v3 hands them to a command handler by
 * injection instead, so this is the bundle a feature receives rather than
 * imports.
 *
 * The practical difference is that a feature is now runnable without an
 * extension host: pass fakes and call it.
 */

import {
  Editors,
  Localization,
  Notifications,
  QuickInput,
  type CommandsService,
  type FileWatcherService,
  type Injected,
  type OperationProgress,
  type OperationsService,
  type WebviewService,
} from '@kkdev92/vscode-ext-kit';

import { EditorSettings, Settings } from './config';
import { AppLog } from './logging';
import type { RegexClient } from '../regex/client';

/**
 * What every handler in the module is given, without asking.
 *
 * Declared here rather than in `extension.ts` so the type below can be derived
 * from it: keeping a hand-written interface in step with the token map is
 * exactly the drift nobody notices until a member is silently `unknown`.
 */
export const uses = {
  /**
   * Scoped per feature, so an entry says where it came from — and filtered by
   * `quickUtils.logLevel`, which is why it is {@link AppLog} rather than the
   * framework's `Log`.
   */
  logger: AppLog,
  /** This extension's settings. */
  config: Settings.token,
  /** `editor.*`, for the settings VS Code owns. */
  editorConfig: EditorSettings.token,
  /** Messages and confirmations. */
  notify: Notifications,
  /** Quick picks, input boxes and the wizard. */
  ask: QuickInput,
  /** Reading and editing text. */
  editors: Editors,
  /** The display language, and formatting for it. */
  l10n: Localization,
} as const;

/** What every feature needs — the resolved shape of {@link uses}. */
export type Services = Injected<typeof uses>;

/**
 * {@link Services} plus the progress facility, for a feature that reports it.
 *
 * Progress belongs to the operation rather than to the application, which is
 * why it arrives separately: a session is tied to the command that started it
 * and to the signal that cancels it.
 */
export interface ProgressServices extends Services {
  readonly progress: OperationProgress;
}

/**
 * {@link Services} plus what the regex tester panel needs.
 *
 * The tester is the one feature that outlives the command that opened it: its
 * RPC handlers run long after, so they cannot borrow that command's context.
 * `operations` is how they get one of their own, and `watchers` is how they
 * watch a file the user picked at runtime rather than a declared glob.
 */
export interface TesterServices extends Services {
  readonly webviews: WebviewService;
  readonly operations: OperationsService;
  readonly watchers: FileWatcherService;
  readonly commands: CommandsService;
  readonly client: RegexClient;
}
