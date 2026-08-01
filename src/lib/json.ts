/**
 * JSON reformatting.
 *
 * All three operations round-trip through `JSON.parse`, so invalid input
 * fails before the editor is touched. `JSON.parse`'s own message ("Unexpected
 * token } in JSON at position 42") is the most useful thing to show the
 * user, so it is preserved rather than replaced.
 */

/** Thrown when input is not parseable JSON. Carries the parser's own message. */
export class JsonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonParseError';
  }
}

function parse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new JsonParseError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Re-indents JSON.
 *
 * @param input - JSON text
 * @param indent - Spaces per level, or `'\t'` for tab indentation
 * @throws {JsonParseError} If `input` is not valid JSON.
 */
export function formatJson(input: string, indent: number | '\t' = 2): string {
  return JSON.stringify(parse(input), null, indent);
}

/**
 * Strips all insignificant whitespace from JSON.
 *
 * @throws {JsonParseError} If `input` is not valid JSON.
 */
export function minifyJson(input: string): string {
  return JSON.stringify(parse(input));
}

/**
 * Recursively sorts object keys, leaving array order alone — array position
 * is data, object key order is not.
 *
 * Sorting uses the default lexicographic comparison on UTF-16 code units
 * rather than `localeCompare`, so the output does not depend on the editor's
 * display language: the same file sorts identically for every contributor.
 */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([key, nested]) => [key, sortValue(nested)]));
  }
  return value;
}

/**
 * Sorts every object's keys, recursively, and re-indents.
 *
 * @param input - JSON text
 * @param indent - Spaces per level, or `'\t'` for tab indentation
 * @throws {JsonParseError} If `input` is not valid JSON.
 */
export function sortJsonKeys(input: string, indent: number | '\t' = 2): string {
  return JSON.stringify(sortValue(parse(input)), null, indent);
}

/** Values of the `quickUtils.jsonIndent` setting. */
export type JsonIndentSetting = 'editor' | '2' | '4' | 'tab';

/**
 * Resolves the indent setting to what `JSON.stringify` wants.
 *
 * `'editor'` follows `editor.tabSize`, so reformatted JSON matches the
 * surrounding file without the user configuring indentation twice.
 *
 * @param setting - The `quickUtils.jsonIndent` value
 * @param tabSize - Current `editor.tabSize`
 */
export function resolveIndent(setting: JsonIndentSetting, tabSize: number): number | '\t' {
  switch (setting) {
    case 'tab':
      return '\t';
    case '2':
      return 2;
    case '4':
      return 4;
    case 'editor':
      // A hand-edited editor.tabSize can be anything; JSON.stringify clamps
      // above 10 itself, but a negative or fractional value would silently mean
      // "no indent", so it is normalised here instead.
      return Number.isFinite(tabSize) && tabSize >= 1 ? Math.floor(tabSize) : 2;
  }
}
