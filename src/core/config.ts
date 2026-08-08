/**
 * Typed mirror of `contributes.configuration`.
 *
 * Every read is validated against its spec at runtime, so a hand-edited or
 * stale `settings.json` falls back to the declared default instead of reaching
 * a code path as an unchecked value.
 *
 * The accessor is injected rather than imported: `defineSettings` produces a
 * token, the host builds the accessor, and anything that reads a setting is
 * handed one. That is what lets a feature be tested without an extension host.
 */

import {
  defineSettings,
  setting,
  type SettingsAccessor,
  type SettingsValues,
} from '@kkdev92/vscode-ext-kit';

import { CONFIG, EXTENSION_ID } from './constants';
import { DATE_PATTERNS } from '../lib/datetime';
import { resolveIndent } from '../lib/json';

export const Settings = defineSettings({
  section: EXTENSION_ID,
  values: {
    [CONFIG.LOG_LEVEL]: setting.enum({
      values: ['trace', 'debug', 'info', 'warn', 'error'],
      default: 'info',
    }),
    [CONFIG.DATE_PATTERNS]: setting.stringArray({ default: [...DATE_PATTERNS], items: { minLength: 1 } }),
    [CONFIG.JSON_INDENT]: setting.enum({
      values: ['editor', '2', '4', 'tab'],
      default: 'editor',
    }),
    [CONFIG.HISTORY_SIZE]: setting.integer({ default: 100, minimum: 0, maximum: 1000 }),
    [CONFIG.HISTORY_PAGE_SIZE]: setting.integer({ default: 50, minimum: 10, maximum: 500 }),
    [CONFIG.HASH_ALGORITHM]: setting.enum({
      values: ['sha256', 'sha512', 'sha384', 'sha1', 'md5'],
      default: 'sha256',
    }),
    [CONFIG.HMAC_KEY_ENCODING]: setting.enum({
      values: ['utf8', 'hex', 'base64'],
      default: 'utf8',
    }),
    [CONFIG.PASSWORD_LENGTH]: setting.integer({ default: 20, minimum: 8, maximum: 128 }),
    [CONFIG.REGEX_TIMEOUT]: setting.integer({ default: 2000, minimum: 100, maximum: 60_000 }),
    [CONFIG.STATUS_BAR]: setting.boolean({ default: true }),
  },
});

/** This extension's settings, as a value object. */
export type ConfigValues = SettingsValues<(typeof Settings)['values']>;

/** What a feature is handed to read settings. */
export type Config = SettingsAccessor<ConfigValues>;

/**
 * `editor.tabSize`, declared as its own group.
 *
 * It belongs to VS Code, not to this extension, which is why it is a separate
 * declaration: a settings group is scoped to one section, and re-declaring a
 * VS Code-owned setting under `quickUtils.*` would mean maintaining a second
 * source of truth for something the editor already tracks.
 */
export const EditorSettings = defineSettings({
  section: 'editor',
  values: {
    tabSize: setting.integer({ default: 4, minimum: 1, maximum: 16 }),
  },
});

/** What a feature is handed to read `editor.*`. */
export type EditorConfig = SettingsAccessor<SettingsValues<(typeof EditorSettings)['values']>>;

/** Current JSON indentation, from `jsonIndent` and `editor.tabSize`. */
export function resolveJsonIndent(config: Config, editor: EditorConfig): number | '\t' {
  return resolveIndent(config.read().get(CONFIG.JSON_INDENT), editor.read().get('tabSize'));
}
