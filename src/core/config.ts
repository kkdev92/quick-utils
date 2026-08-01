/**
 * Typed mirror of `contributes.configuration`.
 *
 * Every read is validated against its schema at runtime, so a hand-edited or
 * stale `settings.json` falls back to the declared default instead of
 * reaching a code path as an unchecked value. `checkPackageJsonSync` (called
 * from `activate`) catches the other direction: a key declared here but
 * forgotten in the manifest.
 */

import { defineConfigSchema, field, s, watchSetting } from '@kkdev92/vscode-ext-kit';

import { CONFIG, EXTENSION_ID } from './constants';
import { DATE_PATTERNS } from '../lib/datetime';
import { resolveIndent } from '../lib/json';

export const config = defineConfigSchema(EXTENSION_ID, {
  [CONFIG.LOG_LEVEL]: field(s.enum('trace', 'debug', 'info', 'warn', 'error'), 'info'),
  [CONFIG.DATE_PATTERNS]: field(s.array(s.string({ minLength: 1 })), [...DATE_PATTERNS]),
  [CONFIG.JSON_INDENT]: field(s.enum('editor', '2', '4', 'tab'), 'editor'),
  [CONFIG.HISTORY_SIZE]: field(s.number({ min: 0, max: 1000, integer: true }), 100),
  [CONFIG.HISTORY_PAGE_SIZE]: field(s.number({ min: 10, max: 500, integer: true }), 50),
  [CONFIG.HASH_ALGORITHM]: field(s.enum('sha256', 'sha512', 'sha384', 'sha1', 'md5'), 'sha256'),
  [CONFIG.HMAC_KEY_ENCODING]: field(s.enum('utf8', 'hex', 'base64'), 'utf8'),
  [CONFIG.PASSWORD_LENGTH]: field(s.number({ min: 8, max: 128, integer: true }), 20),
  [CONFIG.REGEX_TIMEOUT]: field(s.number({ min: 100, max: 60_000, integer: true }), 2000),
  [CONFIG.STATUS_BAR]: field(s.boolean(), true),
});

/**
 * `editor.tabSize` as a live value.
 *
 * This sits outside the extension's own section, which is the whole reason it
 * uses `watchSetting` rather than joining the schema above:
 * `defineConfigSchema` is scoped to one section, and re-declaring a
 * VS Code-owned setting under `quickUtils.*` would mean maintaining a second
 * source of truth for something the editor already tracks.
 */
export const tabSize = watchSetting('editor', 'tabSize', 4);

/** Current JSON indentation, from `jsonIndent` and `editor.tabSize`. */
export function resolveJsonIndent(): number | '\t' {
  return resolveIndent(config.get(CONFIG.JSON_INDENT), tabSize.value);
}
