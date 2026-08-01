import { describe, expect, it } from 'vitest';

import {
  convertCase,
  splitWords,
  toCamelCase,
  toConstantCase,
  toKebabCase,
  toLowerCase,
  toPascalCase,
  toSnakeCase,
  toTitleCase,
  toUpperCase,
} from '../../src/lib/case';

describe('splitWords', () => {
  it('splits on separators', () => {
    expect(splitWords('foo bar-baz_qux.quux/corge:grault\\garply')).toEqual([
      'foo',
      'bar',
      'baz',
      'qux',
      'quux',
      'corge',
      'grault',
      'garply',
    ]);
  });

  it('splits on a lower-to-upper transition', () => {
    expect(splitWords('fooBarBaz')).toEqual(['foo', 'Bar', 'Baz']);
  });

  it('keeps an acronym together but separates the word after it', () => {
    expect(splitWords('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request']);
    expect(splitWords('parseJSON')).toEqual(['parse', 'JSON']);
  });

  it('keeps digits attached to the word they follow', () => {
    expect(splitWords('html5Parser')).toEqual(['html5', 'Parser']);
    expect(splitWords('utf8')).toEqual(['utf8']);
  });

  it('drops empty segments from repeated or leading separators', () => {
    expect(splitWords('__foo___bar__')).toEqual(['foo', 'bar']);
    expect(splitWords('   ')).toEqual([]);
    expect(splitWords('')).toEqual([]);
  });

  it('segments non-ASCII scripts by case, not by byte', () => {
    expect(splitWords('ÜberGrößeWert')).toEqual(['Über', 'Größe', 'Wert']);
  });
});

describe('case conversion', () => {
  it('upper- and lower-case the whole string, separators included', () => {
    expect(toUpperCase('foo-bar baz')).toBe('FOO-BAR BAZ');
    expect(toLowerCase('FOO-BAR BAZ')).toBe('foo-bar baz');
  });

  it.each([
    ['hello world', 'helloWorld', 'HelloWorld', 'hello_world', 'hello-world', 'HELLO_WORLD', 'Hello World'],
    ['XMLHttpRequest', 'xmlHttpRequest', 'XmlHttpRequest', 'xml_http_request', 'xml-http-request', 'XML_HTTP_REQUEST', 'Xml Http Request'],
    ['foo_bar-baz', 'fooBarBaz', 'FooBarBaz', 'foo_bar_baz', 'foo-bar-baz', 'FOO_BAR_BAZ', 'Foo Bar Baz'],
    ['already-kebab', 'alreadyKebab', 'AlreadyKebab', 'already_kebab', 'already-kebab', 'ALREADY_KEBAB', 'Already Kebab'],
  ])('converts %s', (input, camel, pascal, snake, kebab, constant, title) => {
    expect(toCamelCase(input)).toBe(camel);
    expect(toPascalCase(input)).toBe(pascal);
    expect(toSnakeCase(input)).toBe(snake);
    expect(toKebabCase(input)).toBe(kebab);
    expect(toConstantCase(input)).toBe(constant);
    expect(toTitleCase(input)).toBe(title);
  });

  it('returns an empty string when there are no words', () => {
    for (const convert of [toCamelCase, toPascalCase, toSnakeCase, toKebabCase, toConstantCase, toTitleCase]) {
      expect(convert('   ')).toBe('');
    }
  });

  it('capitalizes an astral-plane first character without splitting the surrogate pair', () => {
    // Deseret small letter long i (U+10428) upper-cases to U+10400.
    expect(toPascalCase('\u{10428}foo')).toBe('\u{10400}foo');
  });

  it('dispatches through convertCase', () => {
    expect(convertCase('camel', 'foo bar')).toBe('fooBar');
    expect(convertCase('constant', 'foo bar')).toBe('FOO_BAR');
  });
});
