import { describe, expect, it } from 'vitest';

import {
  JsonParseError,
  formatJson,
  minifyJson,
  resolveIndent,
  sortJsonKeys,
} from '../../src/lib/json';

describe('formatJson', () => {
  it('indents with two spaces by default', () => {
    expect(formatJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('honours a custom indent width and tabs', () => {
    expect(formatJson('{"a":1}', 4)).toBe('{\n    "a": 1\n}');
    expect(formatJson('{"a":1}', '\t')).toBe('{\n\t"a": 1\n}');
  });

  it('reports the parser’s own message on invalid input', () => {
    expect(() => formatJson('{')).toThrow(JsonParseError);
    // The position detail from JSON.parse is what makes the error useful.
    expect(() => formatJson('{"a":}')).toThrow(/position|JSON/i);
  });
});

describe('minifyJson', () => {
  it('strips insignificant whitespace', () => {
    expect(minifyJson('{\n  "a": [1, 2]\n}')).toBe('{"a":[1,2]}');
  });

  it('rejects invalid input', () => {
    expect(() => minifyJson('nope')).toThrow(JsonParseError);
  });
});

describe('sortJsonKeys', () => {
  it('sorts keys at every depth', () => {
    expect(sortJsonKeys('{"b":1,"a":{"d":2,"c":3}}', 0)).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('leaves array order alone', () => {
    expect(sortJsonKeys('{"a":[3,1,2]}', 0)).toBe('{"a":[3,1,2]}');
  });

  it('sorts objects inside arrays', () => {
    expect(sortJsonKeys('[{"b":1,"a":2}]', 0)).toBe('[{"a":2,"b":1}]');
  });

  it('passes primitives and null through', () => {
    expect(sortJsonKeys('{"a":null,"b":true,"c":"s","d":1.5}', 0)).toBe(
      '{"a":null,"b":true,"c":"s","d":1.5}'
    );
  });

  it('sorts by code unit, not locale, so every contributor gets the same output', () => {
    // A locale-aware collation would order these differently.
    expect(sortJsonKeys('{"b":1,"B":2,"a":3,"A":4}', 0)).toBe('{"A":4,"B":2,"a":3,"b":1}');
  });

  it('rejects invalid input', () => {
    expect(() => sortJsonKeys('{')).toThrow(JsonParseError);
  });
});

describe('resolveIndent', () => {
  it('maps the fixed choices', () => {
    expect(resolveIndent('2', 8)).toBe(2);
    expect(resolveIndent('4', 8)).toBe(4);
    expect(resolveIndent('tab', 8)).toBe('\t');
  });

  it('follows editor.tabSize', () => {
    expect(resolveIndent('editor', 3)).toBe(3);
  });

  it('falls back to two when editor.tabSize is not a usable width', () => {
    expect(resolveIndent('editor', 0)).toBe(2);
    expect(resolveIndent('editor', -4)).toBe(2);
    expect(resolveIndent('editor', Number.NaN)).toBe(2);
  });

  it('floors a fractional tab size', () => {
    expect(resolveIndent('editor', 2.7)).toBe(2);
  });
});
