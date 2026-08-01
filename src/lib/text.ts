/**
 * Line-oriented editing and text measurement.
 *
 * Line operations go through {@link splitLines}/{@link joinLines} so that the
 * document's own line ending and its trailing newline survive. Rewriting a
 * CRLF file with LF endings, or eating the final newline, shows up as a
 * whole-file diff in review — the operation being correct is not enough.
 */

/** A document's lines, along with the details needed to reassemble it. */
export interface LineSplit {
  lines: string[];
  /** The line ending the text predominantly used. */
  eol: '\n' | '\r\n';
  /** Whether the text ended with a line ending. */
  trailingNewline: boolean;
}

/**
 * Splits text into lines, recording the dominant line ending and whether a
 * trailing newline was present.
 *
 * "Dominant" rather than "first": a file with mixed endings gets normalised
 * to whichever it has more of, which is the least surprising outcome and
 * matches what editors do on save.
 */
export function splitLines(text: string): LineSplit {
  const crlfCount = (text.match(/\r\n/g) ?? []).length;
  const lfCount = (text.match(/\n/g) ?? []).length - crlfCount;
  const eol: '\n' | '\r\n' = crlfCount > lfCount ? '\r\n' : '\n';

  const trailingNewline = /\r?\n$/.test(text);
  const body = trailingNewline ? text.replace(/\r?\n$/, '') : text;

  return { lines: body.split(/\r?\n/), eol, trailingNewline };
}

/** Reassembles lines using the line ending and trailing newline from a {@link LineSplit}. */
export function joinLines(split: LineSplit, lines: readonly string[]): string {
  return lines.join(split.eol) + (split.trailingNewline ? split.eol : '');
}

/** Options for {@link sortLines}. */
export interface SortLinesOptions {
  /** Sort Z→A instead of A→Z. */
  descending?: boolean;
  /** Treat case as significant (default: false, so `apple` and `Apple` sort together). */
  caseSensitive?: boolean;
  /** Compare embedded digit runs as numbers, so `item9` sorts before `item10`. */
  numeric?: boolean;
  /** Locale for the collation (default: `'en'`). */
  locale?: string;
}

/**
 * Sorts lines with `Intl.Collator`.
 *
 * A collator rather than `<`: comparing UTF-16 code units puts every
 * uppercase letter before every lowercase one and scatters accented
 * characters past `z`, which is not what anyone means by "sort these lines".
 */
export function sortLines(text: string, options: SortLinesOptions = {}): string {
  const collator = new Intl.Collator(options.locale ?? 'en', {
    numeric: options.numeric ?? false,
    sensitivity: options.caseSensitive === true ? 'variant' : 'accent',
    caseFirst: options.caseSensitive === true ? 'upper' : 'false',
  });

  const split = splitLines(text);
  const sorted = [...split.lines].sort((a, b) => collator.compare(a, b));
  if (options.descending === true) {
    sorted.reverse();
  }
  return joinLines(split, sorted);
}

/**
 * Removes repeated lines, keeping the first occurrence of each.
 *
 * Adjacent-only deduplication (what `uniq` does) is deliberately not offered:
 * on unsorted input it silently leaves duplicates behind, which reads as a
 * bug rather than a feature.
 */
export function dedupeLines(text: string, options: { caseSensitive?: boolean } = {}): string {
  const split = splitLines(text);
  const seen = new Set<string>();
  const kept = split.lines.filter((line) => {
    const key = options.caseSensitive === true ? line : line.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return joinLines(split, kept);
}

/** Reverses line order. */
export function reverseLines(text: string): string {
  const split = splitLines(text);
  return joinLines(split, [...split.lines].reverse());
}

/** Strips trailing whitespace from every line. */
export function trimLineEnds(text: string): string {
  const split = splitLines(text);
  return joinLines(
    split,
    split.lines.map((line) => line.replace(/[ \t]+$/, ''))
  );
}

/** Removes lines that are empty or contain only whitespace. */
export function removeBlankLines(text: string): string {
  const split = splitLines(text);
  return joinLines(
    split,
    split.lines.filter((line) => line.trim().length > 0)
  );
}

/** Measurements reported by {@link textStats}. */
export interface TextStats {
  /** Unicode code points — `[...text].length`, not `text.length`. */
  characters: number;
  /** User-perceived characters, so an emoji with a skin-tone modifier counts once. */
  graphemes: number;
  /** Word-like segments per the Unicode text segmentation rules. */
  words: number;
  /** Lines, counting a trailing newline as ending the last line rather than starting a new one. */
  lines: number;
  /** Length in bytes when encoded as UTF-8. */
  bytes: number;
}

/**
 * Measures text.
 *
 * Word and grapheme counts come from `Intl.Segmenter` rather than a
 * whitespace split, which is what makes the numbers right for scripts that
 * do not put spaces between words: `split(/\s+/)` reports a 40-character
 * Japanese sentence as one word.
 *
 * @param text - Text to measure
 * @param locale - Locale driving word segmentation (default: `'en'`). Word
 *   boundaries in Chinese, Japanese and Thai are dictionary-based, so the
 *   locale genuinely changes the count.
 */
export function textStats(text: string, locale = 'en'): TextStats {
  const graphemeSegmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });
  const wordSegmenter = new Intl.Segmenter(locale, { granularity: 'word' });

  let graphemes = 0;
  for (const _ of graphemeSegmenter.segment(text)) {
    graphemes++;
  }

  let words = 0;
  for (const segment of wordSegmenter.segment(text)) {
    if (segment.isWordLike === true) {
      words++;
    }
  }

  return {
    characters: [...text].length,
    graphemes,
    words,
    lines: text.length === 0 ? 0 : splitLines(text).lines.length,
    bytes: Buffer.byteLength(text, 'utf8'),
  };
}

/** Every line operation {@link applyLineOperation} can apply. */
export type LineOperation =
  | 'sortAscending'
  | 'sortDescending'
  | 'sortNumeric'
  | 'dedupe'
  | 'reverse'
  | 'trimLineEnds'
  | 'removeBlankLines';

/** Applies the named line operation. */
export function applyLineOperation(operation: LineOperation, text: string, locale?: string): string {
  switch (operation) {
    case 'sortAscending':
      return sortLines(text, { locale });
    case 'sortDescending':
      return sortLines(text, { descending: true, locale });
    case 'sortNumeric':
      return sortLines(text, { numeric: true, locale });
    case 'dedupe':
      return dedupeLines(text);
    case 'reverse':
      return reverseLines(text);
    case 'trimLineEnds':
      return trimLineEnds(text);
    case 'removeBlankLines':
      return removeBlankLines(text);
  }
}
