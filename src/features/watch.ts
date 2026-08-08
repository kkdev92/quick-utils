/**
 * Watching a glob the user just typed.
 *
 * The declared watcher next door reloads `.quick-utils.json`, and it is
 * declared because that pattern is known when the extension is written. This is
 * the other half of the same ability: nobody knows in advance that you want to
 * see what `**\/*.snap` does while a test suite runs, so the pattern arrives at
 * runtime and the watcher lives exactly as long as you keep watching.
 *
 * That lifetime is the interesting part. The watch runs as one long operation
 * with a cancel button, and the watcher is owned by the operation's resource
 * scope — so cancelling, or the extension shutting down mid-watch, releases the
 * file-system handle by the same path. Nothing here disposes anything by hand.
 */

import type {
  FileWatcherService,
  OperationContext,
  StatusBarService,
} from '@kkdev92/vscode-ext-kit';

import type { Services } from '../core/services';

/** What the watch command needs beyond the module's ambient set. */
export interface WatchContext extends Services {
  readonly watchers: FileWatcherService;
  readonly status: StatusBarService;
}

/** How long a batch of changes is allowed to settle before it is reported. */
const BATCH_MS = 300;

/**
 * Asks for a glob, then reports what happens to it until cancelled.
 *
 * @example
 * ```ts
 * module.commands.handle(Cmd.WatchFiles, {
 *   inject: { watchers: FileWatchers, status: StatusBar },
 *   execute: (operation, _args, injected) => watchFiles(injected, operation),
 * });
 * ```
 */
export async function watchFiles(
  context: WatchContext,
  operation: OperationContext
): Promise<void> {
  const pattern = await context.ask.text({
    prompt: context.l10n.t('A glob to watch, relative to the workspace root.'),
    value: '**/*.json',
    validate: (value) =>
      value.trim().length === 0 ? context.l10n.t('Enter a glob pattern.') : undefined,
    signal: operation.signal,
  });
  if (pattern === undefined) {
    return;
  }

  let changes = 0;
  await operation.progress.run(
    {
      title: context.l10n.t('Watching {0}', pattern),
      cancellable: true,
      location: 'window',
    },
    async (progress, signal) => {
      const watcher = context.watchers.watch({
        patterns: pattern.trim(),
        debounceDelay: BATCH_MS,
      });
      // The scope releases it when this operation ends, however it ends —
      // cancelled from the notification, cancelled by shutdown, or returned
      // from normally. There is no disposal below to forget.
      operation.resources.own(watcher);

      watcher.onDidChange((events) => {
        changes += events.length;
        progress.report({ message: context.l10n.t('{0} changes', String(changes)) });
        context.logger.debug('watched batch', { pattern, batch: events.length, total: changes });
      });

      // Watching has no completion of its own: it runs until the user stops it.
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener('abort', () => {
          resolve();
        });
      });
    }
  );

  context.status.flash(
    `$(eye) ${context.l10n.t('Stopped watching after {0} changes', String(changes))}`,
    2500
  );
}
