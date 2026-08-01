import { describe, expect, it } from 'vitest';

import { COMMANDS } from '../../src/core/constants';
import { createTransformRegistry } from '../../src/core/transforms';

function registry(indent: number | '\t' = 2, locale = 'en'): ReturnType<typeof createTransformRegistry> {
  return createTransformRegistry({ jsonIndent: () => indent, locale: () => locale });
}

describe('transform registry', () => {
  it('has unique ids', () => {
    const ids = registry().all.map((transform) => transform.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * Transform ids are persisted in history and in "Apply Again", so renaming one
   * silently orphans stored data. This list is the contract; changing it needs a
   * migration, not just an edit.
   */
  it('keeps its published ids', () => {
    expect(registry().all.map((transform) => transform.id)).toEqual([
      'case.upper',
      'case.lower',
      'case.camel',
      'case.pascal',
      'case.snake',
      'case.kebab',
      'case.constant',
      'case.title',
      'codec.base64Encode',
      'codec.base64Decode',
      'codec.base64UrlEncode',
      'codec.urlEncode',
      'codec.urlDecode',
      'codec.htmlEscape',
      'codec.htmlUnescape',
      'codec.hexEncode',
      'codec.hexDecode',
      'codec.jsonEscape',
      'codec.jsonUnescape',
      'lines.sortAscending',
      'lines.sortDescending',
      'lines.sortNumeric',
      'lines.dedupe',
      'lines.reverse',
      'lines.trimLineEnds',
      'lines.removeBlankLines',
      'json.format',
      'json.minify',
      'json.sortKeys',
    ]);
  });

  it('gives every transform a label and a codicon', () => {
    for (const transform of registry().all) {
      expect(transform.label.length).toBeGreaterThan(0);
      expect(transform.icon).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('only references commands that exist', () => {
    const known = new Set<string>(Object.values(COMMANDS));
    for (const transform of registry().all) {
      if (transform.command !== undefined) {
        expect(known).toContain(transform.command);
      }
    }
  });

  it('maps each command to exactly one transform', () => {
    const commands = registry()
      .all.map((transform) => transform.command)
      .filter((command): command is string => command !== undefined);
    expect(new Set(commands).size).toBe(commands.length);
  });

  it('resolves by id', () => {
    expect(registry().get('case.camel')?.apply('foo bar')).toBe('fooBar');
    expect(registry().has('case.camel')).toBe(true);
    expect(registry().get('nope.nope')).toBeUndefined();
    expect(registry().has('nope.nope')).toBe(false);
  });

  /**
   * Every entry, applied.
   *
   * A 29-row table of closures is exactly where a copy-paste slip hides — an
   * entry labelled "Hex Encode" wired to `hexDecode` would pass every other test
   * in this file. Each row here pins one entry to one observable result.
   */
  it.each([
    ['case.upper', 'foo bar', 'FOO BAR'],
    ['case.lower', 'FOO BAR', 'foo bar'],
    ['case.camel', 'foo bar', 'fooBar'],
    ['case.pascal', 'foo bar', 'FooBar'],
    ['case.snake', 'fooBar', 'foo_bar'],
    ['case.kebab', 'fooBar', 'foo-bar'],
    ['case.constant', 'fooBar', 'FOO_BAR'],
    ['case.title', 'foo_bar', 'Foo Bar'],

    ['codec.base64Encode', 'hi', 'aGk='],
    ['codec.base64Decode', 'aGk=', 'hi'],
    ['codec.base64UrlEncode', 'ûÿ', 'w7vDvw'],
    ['codec.urlEncode', 'a b', 'a%20b'],
    ['codec.urlDecode', 'a%20b', 'a b'],
    ['codec.htmlEscape', '<a>', '&lt;a&gt;'],
    ['codec.htmlUnescape', '&lt;a&gt;', '<a>'],
    ['codec.hexEncode', 'hi', '6869'],
    ['codec.hexDecode', '6869', 'hi'],
    ['codec.jsonEscape', 'a"b', 'a\\"b'],
    ['codec.jsonUnescape', 'a\\"b', 'a"b'],

    ['lines.sortAscending', 'b\na', 'a\nb'],
    ['lines.sortDescending', 'a\nb', 'b\na'],
    ['lines.sortNumeric', 'x10\nx9', 'x9\nx10'],
    ['lines.dedupe', 'a\na\nb', 'a\nb'],
    ['lines.reverse', 'a\nb', 'b\na'],
    ['lines.trimLineEnds', 'a  \nb\t', 'a\nb'],
    ['lines.removeBlankLines', 'a\n\nb', 'a\nb'],

    ['json.format', '{"a":1}', '{\n  "a": 1\n}'],
    ['json.minify', '{ "a": 1 }', '{"a":1}'],
    ['json.sortKeys', '{"b":1,"a":2}', '{\n  "a": 2,\n  "b": 1\n}'],
  ])('%s transforms its input', (id, input, expected) => {
    expect(registry().get(id)?.apply(input)).toBe(expected);
  });

  it('covers every registered transform in the table above', () => {
    // Keeps the table honest when a transform is added.
    expect(registry().all).toHaveLength(29);
  });

  it('reads the JSON indent from its dependency on every call', () => {
    let indent: number | '\t' = 2;
    const live = createTransformRegistry({ jsonIndent: () => indent, locale: () => 'en' });
    expect(live.get('json.format')?.apply('{"a":1}')).toBe('{\n  "a": 1\n}');
    indent = '\t';
    // A registry that captured the value at construction would still emit spaces.
    expect(live.get('json.format')?.apply('{"a":1}')).toBe('{\n\t"a": 1\n}');
  });

  it('reads the locale from its dependency for line sorting', () => {
    let locale = 'en';
    const live = createTransformRegistry({ jsonIndent: () => 2, locale: () => locale });
    // Swedish sorts 'ä' after 'z'; English sorts it with 'a'.
    expect(live.get('lines.sortAscending')?.apply('ä\nz')).toBe('ä\nz');
    locale = 'sv';
    expect(live.get('lines.sortAscending')?.apply('ä\nz')).toBe('z\nä');
  });

  it('propagates the failure of a transform that rejects its input', () => {
    expect(() => registry().get('codec.base64Decode')?.apply('not base64!')).toThrow();
    expect(() => registry().get('json.format')?.apply('{')).toThrow();
  });
});
