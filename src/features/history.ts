/**
 * Operation history: a capped, versioned log in global state, plus the tree
 * view that renders it.
 */

import * as vscode from 'vscode';
import {
  BaseTreeDataProvider,
  createGlobalStorage,
  formatRelativeTime,
  l10n,
  throttle,
  withPagination,
  type Logger,
  type TreeItemData,
  type TypedStorage,
} from '@kkdev92/vscode-ext-kit';

import { COMMANDS, CONFIG, STORAGE } from '../core/constants';
import { config } from '../core/config';
import { translatable } from '../core/i18n';
import { HISTORY_VERSION, historySchema, type HistoryData, type HistoryEntry } from '../core/types';

/**
 * Maps the operation names written by 0.1.x onto current transform ids.
 *
 * Entries whose operation is not listed are dropped by the migration: history
 * is a convenience log, and inventing an id for an operation that no longer
 * exists would leave "Apply Again" pointing at nothing.
 */
const LEGACY_OPERATION_IDS: Record<string, string> = {
  uppercase: 'case.upper',
  lowercase: 'case.lower',
  camelCase: 'case.camel',
  pascalCase: 'case.pascal',
  snakeCase: 'case.snake',
  kebabCase: 'case.kebab',
  base64Encode: 'codec.base64Encode',
  base64Decode: 'codec.base64Decode',
  urlEncode: 'codec.urlEncode',
  urlDecode: 'codec.urlDecode',
  format: 'json.format',
  minify: 'json.minify',
  uuid: 'generate.uuidV4',
  lorem: 'generate.lorem',
  date: 'generate.date',
};

const LEGACY_KINDS = new Set(['transform', 'generate', 'json']);

/**
 * Migrates 0.1.x history (`{ type, operation }` per entry) to the current
 * shape (`{ id, kind }`).
 *
 * Written defensively because the input is whatever was on disk: anything
 * unrecognisable is skipped rather than trusted, and a wholly unusable value
 * yields an empty history instead of throwing, which would make every read
 * fall back to the default anyway.
 */
function migrateFromV1(old: unknown): HistoryData {
  const entries: HistoryEntry[] = [];

  const legacyEntries = (old as { entries?: unknown }).entries;
  if (Array.isArray(legacyEntries)) {
    for (const candidate of legacyEntries as unknown[]) {
      if (typeof candidate !== 'object' || candidate === null) {
        continue;
      }
      const { type, operation, timestamp, output } = candidate as Record<string, unknown>;
      if (typeof type !== 'string' || typeof operation !== 'string') {
        continue;
      }
      const id = LEGACY_OPERATION_IDS[operation];
      if (id === undefined || !LEGACY_KINDS.has(type)) {
        continue;
      }
      entries.push({
        id,
        kind: type as HistoryEntry['kind'],
        timestamp: typeof timestamp === 'number' ? timestamp : 0,
        ...(typeof output === 'string' ? { output } : {}),
      });
    }
  }

  return { version: HISTORY_VERSION, entries };
}

/** Longest output kept in an entry. Digests and UUIDs fit; documents do not. */
const MAX_STORED_OUTPUT = 256;

/** The persisted operation log. */
export class HistoryStore implements vscode.Disposable {
  private readonly storage: TypedStorage<HistoryData>;
  private readonly emitter = new vscode.EventEmitter<void>();

  /** Fires after any change to the stored entries. */
  readonly onDidChange = this.emitter.event;

  constructor(
    context: vscode.ExtensionContext,
    private readonly logger: Logger
  ) {
    this.storage = createGlobalStorage<HistoryData>(context, STORAGE.HISTORY, {
      defaultValue: { version: HISTORY_VERSION, entries: [] },
      schema: historySchema,
      version: HISTORY_VERSION,
      migrations: { 1: migrateFromV1 },
      // History is a per-machine convenience, and it can contain fragments of
      // whatever the user was editing. Syncing it across machines would move
      // that data off the machine it was produced on for no real benefit.
      syncable: false,
    });

    // Surface corruption once, at startup, rather than silently serving the
    // default forever.
    const initial = this.storage.tryGet();
    if (!initial.ok) {
      this.logger.warn('Stored history was unusable and has been reset', {
        issues: initial.error.map((issue) => `${issue.stage}: ${issue.message}`),
      });
    }
  }

  /** Records an operation, evicting the oldest entries beyond the configured cap. */
  async add(entry: HistoryEntry): Promise<void> {
    const limit = config.get(CONFIG.HISTORY_SIZE);
    if (limit === 0) {
      return;
    }

    const trimmed: HistoryEntry = {
      ...entry,
      ...(entry.output !== undefined && entry.output.length > MAX_STORED_OUTPUT
        ? { output: undefined }
        : {}),
    };

    const data = this.storage.get();
    await this.storage.set({
      version: HISTORY_VERSION,
      entries: [trimmed, ...data.entries].slice(0, limit),
    });
    this.emitter.fire();
    this.logger.trace('history entry added', { id: entry.id });
  }

  /** Every entry, most recent first. */
  getAll(): readonly HistoryEntry[] {
    return this.storage.get().entries;
  }

  /** Number of stored entries. */
  get count(): number {
    return this.storage.get().entries.length;
  }

  /** Removes every entry. */
  async clear(): Promise<void> {
    await this.storage.delete();
    this.emitter.fire();
    this.logger.info('History cleared');
  }

  dispose(): void {
    this.emitter.dispose();
    this.storage.dispose();
  }
}

/** A history row. `data` carries the entry so commands do not re-look it up. */
export type HistoryItem = TreeItemData<HistoryEntry>;

/** Labels for recorded operations that are not selection transforms. */
const NON_TRANSFORM_LABELS: Record<string, string> = {
  'generate.uuidV4': translatable('UUID (v4)'),
  'generate.uuidV7': translatable('UUID (v7)'),
  'generate.lorem': translatable('Lorem Ipsum'),
  'generate.date': translatable('Date / Time'),
  'generate.timestamp': translatable('Timestamp'),
};

/**
 * Names a recorded operation.
 *
 * Transforms resolve through the registry so their label follows any rename;
 * digests are derived from the id, since `hash.sha256` needs no separate
 * translation to read as `SHA256`.
 */
export function describeHistoryEntry(
  registry: { get(id: string): { label: string } | undefined },
  entry: HistoryEntry
): string {
  const transform = registry.get(entry.id);
  if (transform !== undefined) {
    return l10n.t(transform.label);
  }

  const known = NON_TRANSFORM_LABELS[entry.id];
  if (known !== undefined) {
    return l10n.t(known);
  }

  if (entry.id.startsWith('hmac.')) {
    return `HMAC-${entry.id.slice('hmac.'.length).toUpperCase()}`;
  }
  if (entry.id.startsWith('hash.')) {
    return entry.id.slice('hash.'.length).toUpperCase();
  }
  return entry.id;
}

const KIND_ICONS: Record<HistoryEntry['kind'], string> = {
  transform: 'symbol-text',
  generate: 'sparkle',
  hash: 'key',
  json: 'json',
};

/**
 * Renders {@link HistoryStore} as a flat tree.
 *
 * Refreshes are throttled because a multi-cursor transform records one entry
 * per invocation and the store fires per write; redrawing the view on each
 * would be visible flicker for no information gained.
 */
export class HistoryTreeProvider extends BaseTreeDataProvider<HistoryItem> {
  private page = 1;
  private readonly subscription: vscode.Disposable;
  private readonly refreshThrottled = throttle(() => {
    this.refresh();
  }, 250);

  constructor(
    private readonly store: HistoryStore,
    private readonly labelFor: (entry: HistoryEntry) => string
  ) {
    super();
    this.subscription = this.store.onDidChange(() => {
      this.refreshThrottled();
    });
  }

  getRoots(): HistoryItem[] {
    const entries = this.store.getAll();
    const items = entries.map((entry, index) => this.toItem(entry, index));
    const pageSize = config.get(CONFIG.HISTORY_PAGE_SIZE) * this.page;

    // The command makes the "Load more…" row itself clickable (kit 2.1.0).
    return withPagination(items, pageSize, {
      label: l10n.t('Load more…'),
      command: { command: COMMANDS.HISTORY_LOAD_MORE, title: l10n.t('Load more…') },
    });
  }

  getChildrenOf(): HistoryItem[] {
    return [];
  }

  /** Shows one more page. */
  loadMore(): void {
    this.page++;
    this.refresh();
  }

  /** Collapses back to a single page — called after the store is cleared. */
  resetPaging(): void {
    this.page = 1;
  }

  override dispose(): void {
    this.refreshThrottled.cancel();
    this.subscription.dispose();
    super.dispose();
  }

  private toItem(entry: HistoryEntry, index: number): HistoryItem {
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${this.labelFor(entry)}**\n\n`);
    if (entry.file !== undefined) {
      tooltip.appendMarkdown(`${l10n.t('File')}: \`${entry.file}\`\n\n`);
    }
    if (entry.output !== undefined) {
      // appendCodeblock escapes for us; appendMarkdown would let a stored
      // backtick break out of the block.
      tooltip.appendCodeblock(entry.output, 'text');
    }

    return {
      // Timestamps collide when several operations land in the same
      // millisecond, and tree item ids must be unique across the whole tree.
      id: `history:${String(entry.timestamp)}:${String(index)}`,
      label: this.labelFor(entry),
      description: relativeTime(entry.timestamp),
      tooltip,
      iconPath: new vscode.ThemeIcon(KIND_ICONS[entry.kind]),
      // Drives the `when` clauses on the row's context-menu items.
      contextValue: entry.output === undefined ? 'historyEntry' : 'historyEntryWithOutput',
      data: entry,
    };
  }
}

/**
 * Formats an age as localised relative time, picking the largest unit that
 * still reads naturally.
 */
function relativeTime(timestamp: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - timestamp);
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) {
    return formatRelativeTime(-seconds, 'second', 'narrow');
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return formatRelativeTime(-minutes, 'minute', 'narrow');
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return formatRelativeTime(-hours, 'hour', 'narrow');
  }
  return formatRelativeTime(-Math.floor(hours / 24), 'day', 'narrow');
}
