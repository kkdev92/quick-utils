/**
 * Identifiers shared between `package.json` and the code.
 *
 * Everything the manifest names — commands, views, settings, the webview
 * type — is declared once here and referenced from both sides, so a rename
 * that misses one place fails to compile instead of failing at runtime.
 */

/** Configuration section and `publisher.name` suffix. */
export const EXTENSION_ID = 'quickUtils';

/** Marketplace publisher, needed to look this extension up in the registry. */
export const PUBLISHER = 'kkdev92';

/** Output channel name. */
export const EXTENSION_NAME = 'Quick Utils';

/** Command identifiers, mirroring `contributes.commands`. */
export const COMMANDS = {
  TRANSFORM: 'quickUtils.transform',
  TRANSFORM_AGAIN: 'quickUtils.transformAgain',
  TRANSFORM_CLIPBOARD: 'quickUtils.transformClipboard',
  TRANSFORM_PIPELINE: 'quickUtils.transformPipeline',
  REPLACE_MATCHES: 'quickUtils.replaceMatches',
  EXTRACT_MATCHES: 'quickUtils.extractMatches',

  UPPER_CASE: 'quickUtils.upperCase',
  LOWER_CASE: 'quickUtils.lowerCase',
  CAMEL_CASE: 'quickUtils.camelCase',
  PASCAL_CASE: 'quickUtils.pascalCase',
  SNAKE_CASE: 'quickUtils.snakeCase',
  KEBAB_CASE: 'quickUtils.kebabCase',
  CONSTANT_CASE: 'quickUtils.constantCase',
  TITLE_CASE: 'quickUtils.titleCase',

  BASE64_ENCODE: 'quickUtils.base64Encode',
  BASE64_DECODE: 'quickUtils.base64Decode',
  URL_ENCODE: 'quickUtils.urlEncode',
  URL_DECODE: 'quickUtils.urlDecode',

  SORT_LINES: 'quickUtils.sortLines',
  DEDUPE_LINES: 'quickUtils.dedupeLines',

  JSON_FORMAT: 'quickUtils.jsonFormat',
  JSON_MINIFY: 'quickUtils.jsonMinify',
  JSON_SORT_KEYS: 'quickUtils.jsonSortKeys',

  GENERATE_UUID: 'quickUtils.generateUuid',
  GENERATE_UUID_V7: 'quickUtils.generateUuidV7',
  GENERATE_PASSWORD: 'quickUtils.generatePassword',
  GENERATE_LOREM: 'quickUtils.generateLorem',
  INSERT_DATE: 'quickUtils.insertDate',
  CONVERT_TIMESTAMP: 'quickUtils.convertTimestamp',

  HASH: 'quickUtils.hash',
  HMAC: 'quickUtils.hmac',
  HMAC_DEFAULT: 'quickUtils.hmacDefault',
  MANAGE_SECRETS: 'quickUtils.manageSecrets',
  SET_DEFAULT_SECRET: 'quickUtils.setDefaultSecret',

  INSPECT: 'quickUtils.inspect',
  OPEN_REGEX_TESTER: 'quickUtils.openRegexTester',

  HISTORY_CLEAR: 'quickUtils.history.clear',
  HISTORY_COPY: 'quickUtils.history.copy',
  HISTORY_REAPPLY: 'quickUtils.history.reapply',
  HISTORY_LOAD_MORE: 'quickUtils.history.loadMore',

  TOOLS_RESET_FAVORITES: 'quickUtils.tools.resetFavorites',
  REPORT_STATE: 'quickUtils.reportState',
  COLLECT_DIAGNOSTICS: 'quickUtils.collectDiagnostics',
  INSPECT_DOCUMENT: 'quickUtils.inspectDocument',

  INSERT_PRESET: 'quickUtils.insertPreset',
  RELOAD_PRESETS: 'quickUtils.reloadPresets',
  WATCH_FILES: 'quickUtils.watchFiles',
} as const;

/** Union of every command this extension registers. */
export type CommandId = (typeof COMMANDS)[keyof typeof COMMANDS];

/** Setting keys within the {@link EXTENSION_ID} section. */
export const CONFIG = {
  LOG_LEVEL: 'logLevel',
  DATE_PATTERNS: 'datePatterns',
  JSON_INDENT: 'jsonIndent',
  HISTORY_SIZE: 'historySize',
  HISTORY_PAGE_SIZE: 'historyPageSize',
  HASH_ALGORITHM: 'hashAlgorithm',
  HMAC_KEY_ENCODING: 'hmacKeyEncoding',
  PASSWORD_LENGTH: 'passwordLength',
  REGEX_TIMEOUT: 'regexTimeoutMs',
  STATUS_BAR: 'showStatusBar',
} as const;

/** View identifiers, mirroring `contributes.views`. */
export const VIEWS = {
  TOOLS: 'quickUtils.tools',
  HISTORY: 'quickUtils.history',
  SCRATCHPAD: 'quickUtils.scratchpad',
} as const;

/** Webview panel type, and the activation event that restores it. */
export const REGEX_TESTER_VIEW_TYPE = 'quickUtils.regexTester';

/** Storage keys. Prefixed so {@link listStorageKeys} can find them all. */
export const STORAGE = {
  HISTORY: 'quickUtils.history',
  FAVORITES: 'quickUtils.favorites',
  LAST_TRANSFORM: 'quickUtils.lastTransform',
} as const;

/** MIME type carrying dragged items in the tools view. */
export const TOOLS_DRAG_MIME = 'application/vnd.code.tree.quickutils.tools';

/** Matches collected before the regex tester stops looking. */
export const REGEX_MATCH_LIMIT = 500;

/**
 * How long the status bar waits after the selection settles before
 * recomputing statistics. Selection changes fire on every cursor movement,
 * and `Intl.Segmenter` over a large selection is not free.
 */
export const SELECTION_DEBOUNCE_MS = 150;

/**
 * Selection measurements kept in memory.
 *
 * Bounded because the key is the selected text itself: an unbounded cache would
 * hold on to every selection made during the session.
 */
export const STATS_CACHE_LIMIT = 32;

/** Characters of surrounding context shown either side of a match in a preview. */
export const MATCH_CONTEXT_CHARS = 24;
