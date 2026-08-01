import { describe, expect, it } from 'vitest';

import {
  applyLineOperation,
  dedupeLines,
  joinLines,
  removeBlankLines,
  reverseLines,
  sortLines,
  splitLines,
  textStats,
  trimLineEnds,
} from '../../src/lib/text';

describe('splitLines', () => {
  it('detects LF and a trailing newline', () => {
    expect(splitLines('a\nb\n')).toEqual({
      lines: ['a', 'b'],
      eol: '\n',
      trailingNewline: true,
    });
  });

  it('detects CRLF', () => {
    expect(splitLines('a\r\nb')).toEqual({
      lines: ['a', 'b'],
      eol: '\r\n',
      trailingNewline: false,
    });
  });

  it('picks the dominant ending for mixed input', () => {
    expect(splitLines('a\r\nb\r\nc\nd').eol).toBe('\r\n');
    expect(splitLines('a\nb\nc\r\nd').eol).toBe('\n');
  });

  it('treats a single line with no newline as one line', () => {
    expect(splitLines('solo')).toEqual({ lines: ['solo'], eol: '\n', trailingNewline: false });
  });
});

describe('joinLines', () => {
  it('round-trips through splitLines', () => {
    for (const text of ['a\nb\n', 'a\r\nb', 'solo', 'a\n\nb\n']) {
      const split = splitLines(text);
      expect(joinLines(split, split.lines)).toBe(text);
    }
  });
});

describe('line operations', () => {
  it('sorts case-insensitively by default', () => {
    expect(sortLines('banana\nApple\ncherry')).toBe('Apple\nbanana\ncherry');
  });

  it('sorts descending on request', () => {
    expect(sortLines('a\nb\nc', { descending: true })).toBe('c\nb\na');
  });

  it('sorts embedded numbers numerically on request', () => {
    expect(sortLines('item10\nitem9', { numeric: true })).toBe('item9\nitem10');
    // Without the option, string order puts 10 before 9.
    expect(sortLines('item10\nitem9')).toBe('item10\nitem9');
  });

  it('distinguishes case when asked to', () => {
    expect(sortLines('a\nA', { caseSensitive: true })).toBe('A\na');
  });

  it('preserves CRLF and the trailing newline while sorting', () => {
    expect(sortLines('b\r\na\r\n')).toBe('a\r\nb\r\n');
  });

  it('removes duplicates, keeping the first occurrence', () => {
    expect(dedupeLines('a\nb\nA\na\nc')).toBe('a\nb\nc');
  });

  it('treats case as significant when asked', () => {
    expect(dedupeLines('a\nA', { caseSensitive: true })).toBe('a\nA');
  });

  it('reverses line order', () => {
    expect(reverseLines('a\nb\nc\n')).toBe('c\nb\na\n');
  });

  it('trims trailing whitespace without touching leading indentation', () => {
    expect(trimLineEnds('  a  \n\tb\t\n')).toBe('  a\n\tb\n');
  });

  it('removes lines that are empty or whitespace only', () => {
    expect(removeBlankLines('a\n\n   \nb\n')).toBe('a\nb\n');
  });

  it('dispatches every operation by name', () => {
    expect(applyLineOperation('sortAscending', 'b\na')).toBe('a\nb');
    expect(applyLineOperation('sortDescending', 'a\nb')).toBe('b\na');
    expect(applyLineOperation('sortNumeric', 'x10\nx9')).toBe('x9\nx10');
    expect(applyLineOperation('dedupe', 'a\na')).toBe('a');
    expect(applyLineOperation('reverse', 'a\nb')).toBe('b\na');
    expect(applyLineOperation('trimLineEnds', 'a  ')).toBe('a');
    expect(applyLineOperation('removeBlankLines', 'a\n\nb')).toBe('a\nb');
  });
});

describe('textStats', () => {
  it('counts ASCII text', () => {
    expect(textStats('hello world')).toMatchObject({
      characters: 11,
      graphemes: 11,
      words: 2,
      lines: 1,
      bytes: 11,
    });
  });

  it('counts an emoji cluster as one grapheme but several code points', () => {
    const family = '👨‍👩‍👧‍👦';
    const stats = textStats(family);
    expect(stats.graphemes).toBe(1);
    expect(stats.characters).toBeGreaterThan(1);
    expect(stats.bytes).toBe(Buffer.byteLength(family, 'utf8'));
  });

  it('segments Japanese into words rather than reporting one', () => {
    // A whitespace split would report 1; dictionary segmentation reports several.
    expect(textStats('私は本を読みます', 'ja').words).toBeGreaterThan(1);
  });

  it('reports UTF-8 byte length, not code unit length', () => {
    expect(textStats('日本語').bytes).toBe(9);
    expect(textStats('日本語').characters).toBe(3);
  });

  it('counts lines with a trailing newline as ending the last line', () => {
    expect(textStats('a\nb\n').lines).toBe(2);
    expect(textStats('a\nb').lines).toBe(2);
  });

  it('reports zero lines for empty text', () => {
    expect(textStats('')).toMatchObject({ characters: 0, graphemes: 0, words: 0, lines: 0, bytes: 0 });
  });
});
