/**
 * The Tools view: every command grouped by category, with a user-ordered
 * Favorites group at the top.
 *
 * Favourites are per-workspace. A list of shortcuts is a property of what you
 * are working on — the transforms that matter in a TypeScript repo are not the
 * ones that matter in a folder of JSON fixtures.
 */

import * as vscode from 'vscode';
import {
  SimpleTreeDataProvider,
  type LocalizationService,
  type Logger,
  type TreeDragAndDropOptions,
  type TreeItemData,
  type TypedStorage,
} from '@kkdev92/vscode-ext-kit';

import { COMMANDS, TOOLS_DRAG_MIME } from '../core/constants';
import { translatable } from '../core/i18n';
import { type Favorites } from '../core/types';
import type { TransformRegistry } from '../core/transforms';

/** One row in the Tools view. */
interface ToolItem extends TreeItemData<{ command: string }> {
  children?: ToolItem[];
}

/** A tool as declared by a category, before it becomes a tree row. */
interface ToolEntry {
  command: string;
  label: string;
  icon: string;
}

interface ToolCategory {
  id: string;
  label: string;
  icon: string;
  tools: ToolEntry[];
}

const FAVORITES_GROUP_ID = 'group:favorites';

/** Prefix marking a row as the canonical (category) occurrence of a tool. */
const TOOL_PREFIX = 'tool:';
/** Prefix marking a row as a Favorites shortcut to a tool. */
const FAVORITE_PREFIX = 'favorite:';

/**
 * Tools that are commands in their own right rather than selection
 * transforms, so they have no entry in the transform registry.
 */
const EXTRA_CATEGORIES: readonly ToolCategory[] = [
  {
    id: 'group:generate',
    label: translatable('Generate'),
    icon: 'sparkle',
    tools: [
      { command: COMMANDS.GENERATE_UUID, label: translatable('UUID (v4)'), icon: 'key' },
      { command: COMMANDS.GENERATE_UUID_V7, label: translatable('UUID (v7, time-ordered)'), icon: 'key' },
      { command: COMMANDS.GENERATE_PASSWORD, label: translatable('Password'), icon: 'shield' },
      { command: COMMANDS.GENERATE_LOREM, label: translatable('Lorem Ipsum'), icon: 'note' },
      { command: COMMANDS.INSERT_DATE, label: translatable('Date / Time'), icon: 'calendar' },
      { command: COMMANDS.CONVERT_TIMESTAMP, label: translatable('Convert Unix Timestamp'), icon: 'watch' },
    ],
  },
  {
    id: 'group:hash',
    label: translatable('Hash'),
    icon: 'key',
    tools: [
      { command: COMMANDS.HASH, label: translatable('Hash Selection'), icon: 'key' },
      { command: COMMANDS.HMAC, label: translatable('HMAC Selection'), icon: 'shield' },
      { command: COMMANDS.MANAGE_SECRETS, label: translatable('Manage Secrets'), icon: 'lock' },
    ],
  },
  {
    id: 'group:utilities',
    label: translatable('Utilities'),
    icon: 'tools',
    tools: [
      { command: COMMANDS.OPEN_REGEX_TESTER, label: translatable('Regex Tester'), icon: 'regex' },
      { command: COMMANDS.REPLACE_MATCHES, label: translatable('Replace by Pattern'), icon: 'replace-all' },
      { command: COMMANDS.INSPECT, label: translatable('Inspect Selection'), icon: 'symbol-ruler' },
      { command: COMMANDS.TRANSFORM_CLIPBOARD, label: translatable('Transform Clipboard'), icon: 'clippy' },
    ],
  },
];

/** Category labels and icons for the registry-derived groups. */
const TRANSFORM_GROUPS = [
  { id: 'group:case', kind: 'case', label: translatable('Change Case'), icon: 'case-sensitive' },
  { id: 'group:codec', kind: 'codec', label: translatable('Encode / Decode'), icon: 'code' },
  { id: 'group:lines', kind: 'lines', label: translatable('Lines'), icon: 'list-ordered' },
  { id: 'group:json', kind: 'json', label: translatable('JSON'), icon: 'json' },
] as const;

/** Persisted favourites, exposed so commands can reset them. */
export class FavoritesStore {
  private readonly storage: TypedStorage<Favorites>;

  constructor(storage: TypedStorage<Favorites>) {
    this.storage = storage;
  }

  get(): Favorites {
    return this.storage.get();
  }

  async set(favorites: Favorites): Promise<void> {
    await this.storage.set(favorites);
  }

  async reset(): Promise<void> {
    await this.storage.delete();
  }

  dispose(): void {
    this.storage.dispose();
  }
}

/**
 * Builds and maintains the Tools tree.
 *
 * Mutations go through the provider's targeted `updateItem`/`setChildren`
 * rather than `setItems`, so toggling one checkbox does not collapse every
 * category the user had expanded.
 */
export class ToolsTreeProvider extends SimpleTreeDataProvider<ToolItem> {
  private readonly categories: ToolCategory[];
  private readonly byCommand = new Map<string, ToolEntry>();

  constructor(
    registry: TransformRegistry,
    private readonly favorites: FavoritesStore,
    private readonly l10n: LocalizationService,
    private readonly logger: Logger
  ) {
    super();

    this.categories = [
      ...TRANSFORM_GROUPS.map((group) => ({
        id: group.id,
        label: group.label,
        icon: group.icon,
        tools: registry.all
          .filter((transform) => transform.kind === group.kind && transform.command !== undefined)
          .map((transform) => ({
            command: transform.command as string,
            label: transform.label,
            icon: transform.icon,
          })),
      })),
      ...EXTRA_CATEGORIES.map((category) => ({ ...category, tools: [...category.tools] })),
    ];

    for (const category of this.categories) {
      for (const tool of category.tools) {
        this.byCommand.set(tool.command, tool);
      }
    }

    this.setItems(this.buildTree());
  }

  /** Toggles a tool's favourite state from its checkbox. */
  async setFavorite(commandId: string, favorite: boolean): Promise<void> {
    const current = this.favorites.get();
    const next = favorite
      ? current.includes(commandId)
        ? current
        : [...current, commandId]
      : current.filter((id) => id !== commandId);

    if (next === current) {
      return;
    }
    await this.favorites.set(next);
    this.syncFavorites(commandId);
    this.logger.debug('favorite toggled', { commandId, favorite });
  }

  /** Applies a new favourite order after a drag-and-drop reorder. */
  async reorderFavorites(draggedIds: readonly string[], targetId: string | undefined): Promise<void> {
    const current = this.favorites.get();
    const dragged = draggedIds
      .map((id) => toCommandId(id))
      .filter((id): id is string => id !== undefined && current.includes(id));

    if (dragged.length === 0) {
      return;
    }

    const remaining = current.filter((id) => !dragged.includes(id));
    const targetCommand = targetId === undefined ? undefined : toCommandId(targetId);
    const insertAt =
      targetCommand === undefined ? remaining.length : Math.max(0, remaining.indexOf(targetCommand));

    await this.favorites.set([
      ...remaining.slice(0, insertAt),
      ...dragged,
      ...remaining.slice(insertAt),
    ]);
    this.syncFavorites();
  }


  /**
   * Refreshes just the Favorites group, plus the category row whose checkbox
   * changed. The categories the user has expanded stay expanded throughout.
   */
  syncFavorites(changedCommand?: string): void {
    const favoriteItems = this.buildFavoriteItems();

    if (favoriteItems.length === 0) {
      // The group is only present while it has contents, so removing the last
      // favourite removes the group itself.
      if (this.findItem(FAVORITES_GROUP_ID) !== undefined) {
        this.removeItem(FAVORITES_GROUP_ID);
      }
    } else if (this.findItem(FAVORITES_GROUP_ID) === undefined) {
      // The group belongs at the top; positional insertion (kit 2.1.0) puts it
      // there without the full rebuild that used to collapse every category.
      this.addItem(this.buildFavoritesGroup(favoriteItems), { index: 0 });
    } else {
      this.setChildren(FAVORITES_GROUP_ID, favoriteItems);
    }

    if (changedCommand !== undefined) {
      this.updateItem(`${TOOL_PREFIX}${changedCommand}`, {
        checkboxState: this.checkboxFor(changedCommand),
      });
    }
  }

  private buildTree(): ToolItem[] {
    const favoriteItems = this.buildFavoriteItems();

    const groups: ToolItem[] = this.categories.map((category) => ({
      id: category.id,
      label: this.l10n.t(category.label),
      icon: category.icon,
      contextValue: 'category',
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      children: category.tools.map((tool) => this.toToolItem(tool)),
    }));

    if (favoriteItems.length === 0) {
      return groups;
    }

    return [this.buildFavoritesGroup(favoriteItems), ...groups];
  }

  /** The Favorites root, expanded — a shelf of shortcuts is for seeing. */
  private buildFavoritesGroup(children: ToolItem[]): ToolItem {
    return {
      id: FAVORITES_GROUP_ID,
      label: this.l10n.t('Favorites'),
      icon: 'star-full',
      contextValue: 'favorites',
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      children,
    };
  }

  private buildFavoriteItems(): ToolItem[] {
    return this.favorites
      .get()
      .map((commandId) => {
        const tool = this.byCommand.get(commandId);
        return tool === undefined ? undefined : this.toFavoriteItem(tool);
      })
      .filter((item): item is ToolItem => item !== undefined);
  }

  private toToolItem(tool: ToolEntry): ToolItem {
    return {
      id: `${TOOL_PREFIX}${tool.command}`,
      label: this.l10n.t(tool.label),
      icon: tool.icon,
      contextValue: 'tool',
      checkboxState: this.checkboxFor(tool.command),
      command: { command: tool.command, title: this.l10n.t(tool.label) },
      data: { command: tool.command },
    };
  }

  private toFavoriteItem(tool: ToolEntry): ToolItem {
    return {
      // A distinct id from the category row: the same command appears twice in
      // the tree, and VS Code requires ids to be unique tree-wide.
      id: `${FAVORITE_PREFIX}${tool.command}`,
      label: this.l10n.t(tool.label),
      icon: tool.icon,
      contextValue: 'favorite',
      command: { command: tool.command, title: this.l10n.t(tool.label) },
      data: { command: tool.command },
    };
  }

  private checkboxFor(commandId: string): vscode.TreeItemCheckboxState {
    return this.favorites.get().includes(commandId)
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
  }
}

/** Recovers the command id from either row-id form. */
function toCommandId(itemId: string): string | undefined {
  if (itemId.startsWith(FAVORITE_PREFIX)) {
    return itemId.slice(FAVORITE_PREFIX.length);
  }
  if (itemId.startsWith(TOOL_PREFIX)) {
    return itemId.slice(TOOL_PREFIX.length);
  }
  return undefined;
}

/**
 * Drag-and-drop for reordering favourites.
 *
 * Dropping a category row onto the Favorites group is a natural way to add a
 * favourite, but the controller only receives ids, and a category id maps to
 * no command — so those drops are ignored and the checkbox stays the single
 * way to add one.
 */
export function createToolsDragAndDrop(
  provider: ToolsTreeProvider
): TreeDragAndDropOptions<ToolItem> {
  return {
    mimeType: TOOLS_DRAG_MIME,
    onDrop: (sourceIds, target) => provider.reorderFavorites(sourceIds, target?.id),
  };
}
