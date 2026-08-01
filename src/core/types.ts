/**
 * Types shared across features, plus the persisted shapes and their schemas.
 *
 * Stored data is versioned and schema-checked: `globalState` survives
 * upgrades and downgrades, so a value written by a future version is
 * something this one has to handle rather than trust.
 */

import { s } from '@kkdev92/vscode-ext-kit';
import type { StandardSchemaV1 } from '@kkdev92/vscode-ext-kit';

import type { CaseStyle } from '../lib/case';
import type { CodecOperation } from '../lib/codec';
import type { LineOperation } from '../lib/text';

/** What kind of thing a transform is, for grouping in the picker and history. */
export type TransformKind = 'case' | 'codec' | 'lines' | 'json';

/** A transform the user can pick, apply again, or find in their history. */
export interface TransformDescriptor {
  /** Stable identifier. Persisted in history and in "transform again", so never reuse one. */
  id: string;
  kind: TransformKind;
  /** Untranslated label; the UI localises it at display time. */
  label: string;
  /** Codicon shown in the picker and the tools view. */
  icon: string;
  /** Applies the transform. Throws for input it cannot handle; callers report that to the user. */
  apply: (input: string) => string;
  /** Command id, when this transform also has one of its own. */
  command?: string;
}

/** The union of every transform operation, for exhaustiveness at the registry. */
export type TransformOperation =
  | { kind: 'case'; style: CaseStyle }
  | { kind: 'codec'; operation: CodecOperation }
  | { kind: 'lines'; operation: LineOperation }
  | { kind: 'json'; operation: 'format' | 'minify' | 'sortKeys' };

/** One recorded operation, as shown in the History view. */
export interface HistoryEntry {
  /** Transform, generator or digest id. */
  id: string;
  /** Localisation-independent grouping for the icon and label. */
  kind: 'transform' | 'generate' | 'hash' | 'json';
  /** `Date.now()` when it ran. */
  timestamp: number;
  /** Basename of the file it ran against, when there was one. */
  file?: string;
  /**
   * The produced value, when it is small enough to be worth keeping —
   * generated UUIDs and digests are, whole reformatted documents are not.
   */
  output?: string;
}

/** Everything persisted under {@link STORAGE.HISTORY}. */
export interface HistoryData {
  version: number;
  entries: HistoryEntry[];
}

const historyEntrySchema = s.object({
  id: s.string({ minLength: 1 }),
  kind: s.enum('transform', 'generate', 'hash', 'json'),
  timestamp: s.number({ min: 0 }),
  file: s.optional(s.string()),
  output: s.optional(s.string()),
});

/**
 * Schema for the persisted history.
 *
 * The cast is the one place this file asserts rather than infers: `s.object`
 * produces a structurally identical type, but `s.optional` widens the
 * optional members to `string | undefined` *required* keys, which is not the
 * same declared type as {@link HistoryEntry}'s `file?: string`.
 */
export const historySchema = s.object({
  version: s.number({ min: 1, integer: true }),
  entries: s.array(historyEntrySchema),
}) as unknown as StandardSchemaV1<unknown, HistoryData>;

/** Current version of {@link HistoryData}. Bump alongside a new migration. */
export const HISTORY_VERSION = 2;

/**
 * Command ids the user has starred in the Tools view.
 *
 * An ordered array rather than a set: the Favorites group is drag-and-drop
 * reorderable, so position is data.
 */
export type Favorites = string[];

export const favoritesSchema = s.array(s.string({ minLength: 1 }));

/**
 * Builds a schema for "the id of a transform that still exists".
 *
 * `s.enum` cannot express this without duplicating the registry, and the
 * registry is the thing that changes: a stored id from an older version whose
 * transform has since been removed must read back as absent, not as a value
 * that later blows up when looked up.
 */
export function transformIdSchema(
  isKnown: (id: string) => boolean
): StandardSchemaV1<unknown, string> {
  return s.custom(
    (value): value is string => typeof value === 'string' && isKnown(value),
    'not a known transform id'
  );
}
