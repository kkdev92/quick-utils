/**
 * Command contracts.
 *
 * v2 registered handlers against a `Record<CommandId, handler>` and relied on
 * the id union to catch a typo. v3 declares a contract per command instead: the
 * contract carries the argument tuple and the result type, so `commands.invoke`
 * and `module.commands.handle` are checked against the same thing, and a
 * command with no handler is a preflight failure rather than a silent gap.
 */

import { defineCommandContract, type CommandContract } from '@kkdev92/vscode-ext-kit';

import { COMMANDS } from './constants';
import type { HistoryItem } from '../features/history';

/** Takes no arguments and returns nothing — most of them. */
function simple(id: string): CommandContract<readonly [], void> {
  return defineCommandContract({ id });
}

export const Transform = simple(COMMANDS.TRANSFORM);
export const TransformAgain = simple(COMMANDS.TRANSFORM_AGAIN);
export const TransformClipboard = simple(COMMANDS.TRANSFORM_CLIPBOARD);
export const TransformPipeline = simple(COMMANDS.TRANSFORM_PIPELINE);
export const ReplaceMatches = simple(COMMANDS.REPLACE_MATCHES);
export const ExtractMatches = simple(COMMANDS.EXTRACT_MATCHES);

export const UpperCase = simple(COMMANDS.UPPER_CASE);
export const LowerCase = simple(COMMANDS.LOWER_CASE);
export const CamelCase = simple(COMMANDS.CAMEL_CASE);
export const PascalCase = simple(COMMANDS.PASCAL_CASE);
export const SnakeCase = simple(COMMANDS.SNAKE_CASE);
export const KebabCase = simple(COMMANDS.KEBAB_CASE);
export const ConstantCase = simple(COMMANDS.CONSTANT_CASE);
export const TitleCase = simple(COMMANDS.TITLE_CASE);

export const Base64Encode = simple(COMMANDS.BASE64_ENCODE);
export const Base64Decode = simple(COMMANDS.BASE64_DECODE);
export const UrlEncode = simple(COMMANDS.URL_ENCODE);
export const UrlDecode = simple(COMMANDS.URL_DECODE);

export const SortLines = simple(COMMANDS.SORT_LINES);
export const DedupeLines = simple(COMMANDS.DEDUPE_LINES);

export const JsonFormat = simple(COMMANDS.JSON_FORMAT);
export const JsonMinify = simple(COMMANDS.JSON_MINIFY);
export const JsonSortKeys = simple(COMMANDS.JSON_SORT_KEYS);

export const GenerateUuid = simple(COMMANDS.GENERATE_UUID);
export const GenerateUuidV7 = simple(COMMANDS.GENERATE_UUID_V7);
export const GeneratePassword = simple(COMMANDS.GENERATE_PASSWORD);
export const GenerateLorem = simple(COMMANDS.GENERATE_LOREM);
export const InsertDate = simple(COMMANDS.INSERT_DATE);
export const ConvertTimestamp = simple(COMMANDS.CONVERT_TIMESTAMP);

export const Hash = simple(COMMANDS.HASH);
export const Hmac = simple(COMMANDS.HMAC);
export const HmacDefault = simple(COMMANDS.HMAC_DEFAULT);
export const ManageSecrets = simple(COMMANDS.MANAGE_SECRETS);
export const SetDefaultSecret = simple(COMMANDS.SET_DEFAULT_SECRET);

export const Inspect = simple(COMMANDS.INSPECT);
export const OpenRegexTester = simple(COMMANDS.OPEN_REGEX_TESTER);

export const HistoryClear = simple(COMMANDS.HISTORY_CLEAR);
export const HistoryLoadMore = simple(COMMANDS.HISTORY_LOAD_MORE);
export const ToolsResetFavorites = simple(COMMANDS.TOOLS_RESET_FAVORITES);

export const ReportState = simple(COMMANDS.REPORT_STATE);
export const CollectDiagnostics = simple(COMMANDS.COLLECT_DIAGNOSTICS);
export const InspectDocument = simple(COMMANDS.INSPECT_DOCUMENT);

export const InsertPreset = simple(COMMANDS.INSERT_PRESET);
export const ReloadPresets = simple(COMMANDS.RELOAD_PRESETS);
export const WatchFiles = simple(COMMANDS.WATCH_FILES);

/**
 * The two invoked from a tree item's context menu.
 *
 * VS Code passes the item itself, so these are the only commands whose argument
 * tuple is not empty.
 */
export const HistoryCopy: CommandContract<readonly [item: HistoryItem], void> =
  defineCommandContract<readonly [item: HistoryItem], void>({ id: COMMANDS.HISTORY_COPY });

export const HistoryReapply: CommandContract<readonly [item: HistoryItem], void> =
  defineCommandContract<readonly [item: HistoryItem], void>({ id: COMMANDS.HISTORY_REAPPLY });
