/**
 * Everything this extension persists, declared in one place.
 *
 * v2 built each store where it was used — `createGlobalStorage(context, ...)`
 * inside the class that read it. v3 declares them, so the host owns the
 * accessors and a feature is handed one. That is what makes the feature
 * testable, and it is also what puts every key, schema and migration in a
 * single file you can read to know what is on disk.
 */

import { defineSecret, defineStorage, s } from '@kkdev92/vscode-ext-kit';

import { STORAGE } from './constants';
import { favoritesSchema, historySchema, HISTORY_VERSION } from './types';
import type { Favorites, HistoryData } from './types';
import { migrateFromV1 } from '../features/history';

/** Operation history: a capped, versioned log. */
export const HistoryStorage = defineStorage<HistoryData>({
  key: STORAGE.HISTORY,
  scope: 'global',
  defaultValue: { version: HISTORY_VERSION, entries: [] },
  schema: historySchema,
  version: HISTORY_VERSION,
  migrations: { 1: migrateFromV1 },
  // History is a per-machine convenience, and it can contain fragments of
  // whatever the user was editing. Syncing it would move that data off the
  // machine it was produced on for no real benefit.
  syncable: false,
});

/** Favourite tools, per workspace. */
export const FavoritesStorage = defineStorage<Favorites>({
  key: STORAGE.FAVORITES,
  scope: 'workspace',
  defaultValue: [],
  schema: favoritesSchema,
});

/**
 * The last transform applied, backing "Apply Again".
 *
 * Per workspace. The id is not validated against the registry here — a
 * declaration cannot see the registry — so a stored id whose transform has
 * since been removed is filtered where it is read.
 */
export const LastTransformStorage = defineStorage<string | undefined>({
  key: STORAGE.LAST_TRANSFORM,
  scope: 'workspace',
  defaultValue: undefined,
  schema: s.optional(s.string()),
});

/**
 * Whether the MD5/SHA-1 warning has been acknowledged.
 *
 * A "Don't Ask Again" answer is stored state like any other, so it is declared
 * here rather than written straight into a memento at the call site.
 */
export const LegacyHashAcknowledged = defineStorage<boolean>({
  key: 'quickUtils.acknowledgedLegacyHash',
  scope: 'global',
  defaultValue: false,
  schema: s.boolean(),
});

/** The default HMAC signing key. */
export const DefaultSecret = defineSecret({ key: 'quickUtils.defaultSecret' });
