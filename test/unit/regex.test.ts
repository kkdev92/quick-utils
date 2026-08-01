import { describe, expect, it } from 'vitest';

import {
  RegexError,
  compileRegex,
  expandReplacement,
  findMatches,
  replaceMatches,
} from '../../src/lib/regex';

describe('compileRegex', () => {
  it('compiles a valid pattern', () => {
    expect(compileRegex('a+', 'gi').flags).toContain('i');
  });

  it('reports the engine’s own message for an invalid pattern', () => {
    expect(() => compileRegex('(', 'g')).toThrow(RegexError);
    expect(() => compileRegex('(', 'g')).toThrow(/group|regular expression/i);
  });

  it('rejects an invalid flag', () => {
    expect(() => compileRegex('a', 'Q')).toThrow(RegexError);
  });
});

describe('findMatches', () => {
  it('collects every match with its offset', () => {
    const { matches, truncated } = findMatches(compileRegex('\\d+', ''), 'a1bb22ccc333', 100);
    expect(truncated).toBe(false);
    expect(matches.map((match) => [match.index, match.text])).toEqual([
      [1, '1'],
      [4, '22'],
      [9, '333'],
    ]);
  });

  it('matches globally even when the pattern has no g flag', () => {
    // A tester showing only the first match would hide most of the answer.
    expect(findMatches(compileRegex('a', ''), 'aaa', 100).matches).toHaveLength(3);
  });

  it('captures numbered and named groups', () => {
    const { matches } = findMatches(
      compileRegex('(?<user>\\w+)@(\\w+)', ''),
      'me@example you@other',
      100
    );
    expect(matches[0]?.captures).toEqual(['me', 'example']);
    expect(matches[0]?.groups).toEqual({ user: 'me' });
  });

  it('reports undefined for a group that did not participate', () => {
    const { matches } = findMatches(compileRegex('(a)|(b)', ''), 'b', 100);
    expect(matches[0]?.captures).toEqual([undefined, 'b']);
  });

  it('leaves groups undefined when the pattern declares none', () => {
    expect(findMatches(compileRegex('a', ''), 'a', 100).matches[0]?.groups).toBeUndefined();
  });

  it('terminates on a zero-length match instead of looping forever', () => {
    const { matches } = findMatches(compileRegex('', ''), 'abc', 100);
    // One empty match at each position, plus one past the end.
    expect(matches).toHaveLength(4);
    expect(matches.every((match) => match.text === '')).toBe(true);
  });

  it('handles a zero-length match anchored per line', () => {
    expect(findMatches(compileRegex('^', 'm'), 'a\nb\nc', 100).matches.map((m) => m.index)).toEqual([
      0, 2, 4,
    ]);
  });

  it('stops at the limit and says so', () => {
    const { matches, truncated } = findMatches(compileRegex('a', ''), 'a'.repeat(50), 10);
    expect(matches).toHaveLength(10);
    expect(truncated).toBe(true);
  });

  it('returns nothing for a pattern that does not match', () => {
    expect(findMatches(compileRegex('z', ''), 'abc', 100)).toEqual({
      matches: [],
      truncated: false,
    });
  });
});

describe('expandReplacement', () => {
  const match = findMatches(compileRegex('(?<first>\\w+) (\\w+)', ''), 'hello world', 1).matches[0];

  it('expands the whole match and numbered groups', () => {
    expect(expandReplacement('$&!', match!)).toBe('hello world!');
    expect(expandReplacement('$2 $1', match!)).toBe('world hello');
  });

  it('expands named groups', () => {
    expect(expandReplacement('<$<first>>', match!)).toBe('<hello>');
  });

  it('emits a literal dollar for $$', () => {
    expect(expandReplacement('$$1', match!)).toBe('$1');
  });

  it('leaves an out-of-range group reference as written', () => {
    expect(expandReplacement('$9', match!)).toBe('$9');
    expect(expandReplacement('$0', match!)).toBe('$0');
  });

  it('substitutes an empty string for a declared group that did not participate', () => {
    const optional = findMatches(compileRegex('a(b)?', ''), 'a', 1).matches[0];
    expect(expandReplacement('[$1]', optional!)).toBe('[]');
  });

  it('substitutes an empty string for an unknown named group', () => {
    expect(expandReplacement('$<nope>', match!)).toBe('');
  });

  it('agrees with String.prototype.replace on the same input', () => {
    const regex = compileRegex('(\\w+)@(\\w+)', 'g');
    const input = 'a@b c@d';
    const replacement = '$2:$1';
    const viaLib = findMatches(regex, input, 100)
      .matches.map((entry) => expandReplacement(replacement, entry))
      .join(' ');
    expect(viaLib).toBe(input.replace(regex, replacement));
  });
});

describe('replaceMatches', () => {
  it('replaces every match', () => {
    expect(replaceMatches(compileRegex('a', ''), 'banana', 'o')).toBe('bonono');
  });

  it('expands group references', () => {
    expect(replaceMatches(compileRegex('(\\w+)@(\\w+)', ''), 'me@here', '$2/$1')).toBe('here/me');
  });

  it('leaves input unchanged when nothing matches', () => {
    expect(replaceMatches(compileRegex('z', ''), 'abc', 'x')).toBe('abc');
  });
});
