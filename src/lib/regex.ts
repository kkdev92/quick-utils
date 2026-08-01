/**
 * Regular expression matching and replacement.
 *
 * Pure and synchronous. It is run inside the regex worker rather than on the
 * extension host, because there is no way to interrupt a backtracking
 * `RegExp.exec` from the same thread — see `src/regex/client.ts`.
 */

/** One match, in the shape the webview needs to highlight it. */
export interface RegexMatch {
  /** Offset of the match in the subject string, in UTF-16 code units. */
  index: number;
  /** The matched text. */
  text: string;
  /** Capture groups by number, starting at group 1. `undefined` for groups that did not participate. */
  captures: (string | undefined)[];
  /** Named capture groups, or `undefined` if the pattern declares none. */
  groups: Record<string, string | undefined> | undefined;
}

/** Outcome of {@link findMatches}. */
export interface RegexMatchResult {
  matches: RegexMatch[];
  /** True when `limit` was reached and further matches exist. */
  truncated: boolean;
}

/** Thrown when a pattern or flag string is not accepted by the engine. */
export class RegexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegexError';
  }
}

/**
 * Compiles a pattern.
 *
 * @throws {RegexError} If the pattern or flags are invalid, carrying the
 *   engine's own message — "Invalid regular expression: /(/: Unterminated
 *   group" is more useful than anything this layer could paraphrase.
 */
export function compileRegex(pattern: string, flags: string): RegExp {
  try {
    return new RegExp(pattern, flags);
  } catch (error) {
    throw new RegexError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Finds up to `limit` matches.
 *
 * A zero-length match (`/^/gm`, `/\b/g`) leaves `lastIndex` where it was, so
 * the loop would never terminate; advancing by one code unit past an empty
 * match is what `String.prototype.matchAll` does internally and is
 * replicated here.
 *
 * @param regex - Compiled pattern. Matched globally regardless of the `g`
 *   flag, since a tester showing only the first match of a non-global pattern
 *   would hide most of the answer.
 * @param input - Subject string
 * @param limit - Maximum matches to collect
 */
export function findMatches(regex: RegExp, input: string, limit: number): RegexMatchResult {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const global = new RegExp(regex.source, flags);

  const matches: RegexMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = global.exec(input)) !== null) {
    if (matches.length >= limit) {
      return { matches, truncated: true };
    }

    matches.push({
      index: match.index,
      text: match[0],
      captures: match.slice(1),
      groups: match.groups === undefined ? undefined : { ...match.groups },
    });

    if (match[0].length === 0) {
      global.lastIndex++;
      if (global.lastIndex > input.length) {
        break;
      }
    }
  }

  return { matches, truncated: false };
}

/**
 * Replaces every match, honouring `$1`, `$<name>` and `$$` in `replacement`
 * exactly as `String.prototype.replaceAll` does.
 *
 * @throws {RegexError} If the replacement references a group the pattern does
 *   not declare.
 */
export function replaceMatches(regex: RegExp, input: string, replacement: string): string {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  try {
    return input.replace(new RegExp(regex.source, flags), replacement);
  } catch (error) {
    throw new RegexError(error instanceof Error ? error.message : String(error));
  }
}

/** `$` patterns recognised in a replacement string. */
const REPLACEMENT_TOKEN = /\$(\$|&|<([^>]*)>|\d{1,2})/g;

/**
 * Expands a replacement string against one {@link RegexMatch}.
 *
 * `String.prototype.replace` does this internally, but it only works when the
 * replacement happens in the same call as the match. Applying matches as a
 * `WorkspaceEdit` means each match's replacement text has to be produced
 * separately, from a match that has already been found — so the substitution
 * rules are reimplemented here.
 *
 * Supported: `$$` (a literal `$`), `$&` (the whole match), `$1`–`$99`
 * (numbered groups) and `$<name>` (named groups). `` $` `` and `$'` are not,
 * because the surrounding text is not carried with a match.
 *
 * An unknown group reference is left as written, which is what the engine
 * does for a number beyond the group count.
 */
export function expandReplacement(replacement: string, match: RegexMatch): string {
  return replacement.replace(REPLACEMENT_TOKEN, (token, body: string, name?: string) => {
    if (body === '$') {
      return '$';
    }
    if (body === '&') {
      return match.text;
    }
    if (name !== undefined) {
      return match.groups?.[name] ?? '';
    }

    const index = Number(body);
    if (index < 1 || index > match.captures.length) {
      return token;
    }
    return match.captures[index - 1] ?? '';
  });
}
