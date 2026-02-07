import { describe, it, expect } from 'vitest';
import {
  toUpperCase,
  toLowerCase,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  toKebabCase,
  base64Encode,
  base64Decode,
  urlEncode,
  urlDecode,
  formatJson,
  minifyJson,
  generateUuid,
  generateLoremIpsum,
  formatDate,
} from '../src/utils/transformers.js';

describe('transformers', () => {
  describe('toUpperCase', () => {
    it('should convert to uppercase', () => {
      expect(toUpperCase('hello world')).toBe('HELLO WORLD');
    });

    it('should handle empty string', () => {
      expect(toUpperCase('')).toBe('');
    });

    it('should handle mixed case', () => {
      expect(toUpperCase('HeLLo WoRLd')).toBe('HELLO WORLD');
    });
  });

  describe('toLowerCase', () => {
    it('should convert to lowercase', () => {
      expect(toLowerCase('HELLO WORLD')).toBe('hello world');
    });

    it('should handle empty string', () => {
      expect(toLowerCase('')).toBe('');
    });
  });

  describe('toCamelCase', () => {
    it('should convert space-separated words', () => {
      expect(toCamelCase('hello world')).toBe('helloWorld');
    });

    it('should convert kebab-case', () => {
      expect(toCamelCase('hello-world')).toBe('helloWorld');
    });

    it('should convert snake_case', () => {
      expect(toCamelCase('hello_world')).toBe('helloWorld');
    });

    it('should convert PascalCase', () => {
      expect(toCamelCase('HelloWorld')).toBe('helloWorld');
    });

    it('should handle empty string', () => {
      expect(toCamelCase('')).toBe('');
    });

    it('should handle single word', () => {
      expect(toCamelCase('hello')).toBe('hello');
    });
  });

  describe('toPascalCase', () => {
    it('should convert space-separated words', () => {
      expect(toPascalCase('hello world')).toBe('HelloWorld');
    });

    it('should convert camelCase', () => {
      expect(toPascalCase('helloWorld')).toBe('HelloWorld');
    });

    it('should handle empty string', () => {
      expect(toPascalCase('')).toBe('');
    });
  });

  describe('toSnakeCase', () => {
    it('should convert space-separated words', () => {
      expect(toSnakeCase('hello world')).toBe('hello_world');
    });

    it('should convert camelCase', () => {
      expect(toSnakeCase('helloWorld')).toBe('hello_world');
    });

    it('should convert PascalCase', () => {
      expect(toSnakeCase('HelloWorld')).toBe('hello_world');
    });

    it('should handle empty string', () => {
      expect(toSnakeCase('')).toBe('');
    });
  });

  describe('toKebabCase', () => {
    it('should convert space-separated words', () => {
      expect(toKebabCase('hello world')).toBe('hello-world');
    });

    it('should convert camelCase', () => {
      expect(toKebabCase('helloWorld')).toBe('hello-world');
    });

    it('should handle empty string', () => {
      expect(toKebabCase('')).toBe('');
    });
  });

  describe('base64Encode / base64Decode', () => {
    it('should encode and decode correctly', () => {
      const original = 'Hello, World!';
      const encoded = base64Encode(original);
      expect(encoded).toBe('SGVsbG8sIFdvcmxkIQ==');
      expect(base64Decode(encoded)).toBe(original);
    });

    it('should handle empty string', () => {
      expect(base64Encode('')).toBe('');
      expect(base64Decode('')).toBe('');
    });

    it('should handle unicode characters', () => {
      const original = 'こんにちは';
      const encoded = base64Encode(original);
      expect(base64Decode(encoded)).toBe(original);
    });
  });

  describe('urlEncode / urlDecode', () => {
    it('should encode and decode correctly', () => {
      const original = 'hello world & foo=bar';
      const encoded = urlEncode(original);
      expect(encoded).toBe('hello%20world%20%26%20foo%3Dbar');
      expect(urlDecode(encoded)).toBe(original);
    });

    it('should handle empty string', () => {
      expect(urlEncode('')).toBe('');
      expect(urlDecode('')).toBe('');
    });
  });

  describe('formatJson', () => {
    it('should format JSON with indentation', () => {
      const input = '{"name":"John","age":30}';
      const expected = '{\n  "name": "John",\n  "age": 30\n}';
      expect(formatJson(input)).toBe(expected);
    });

    it('should throw on invalid JSON', () => {
      expect(() => formatJson('not json')).toThrow();
    });
  });

  describe('minifyJson', () => {
    it('should minify JSON', () => {
      const input = '{\n  "name": "John",\n  "age": 30\n}';
      const expected = '{"name":"John","age":30}';
      expect(minifyJson(input)).toBe(expected);
    });

    it('should throw on invalid JSON', () => {
      expect(() => minifyJson('not json')).toThrow();
    });
  });

  describe('generateUuid', () => {
    it('should generate valid UUID v4', () => {
      const uuid = generateUuid();
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });

    it('should generate unique UUIDs', () => {
      const uuid1 = generateUuid();
      const uuid2 = generateUuid();
      expect(uuid1).not.toBe(uuid2);
    });
  });

  describe('generateLoremIpsum', () => {
    it('should generate single paragraph by default', () => {
      const lorem = generateLoremIpsum();
      expect(lorem).toContain('Lorem ipsum');
      expect(lorem.split('\n\n').length).toBe(1);
    });

    it('should generate multiple paragraphs', () => {
      const lorem = generateLoremIpsum(3);
      expect(lorem.split('\n\n').length).toBe(3);
    });
  });

  describe('formatDate', () => {
    it('should format date with YYYY-MM-DD', () => {
      const date = new Date(2024, 0, 15); // Jan 15, 2024
      expect(formatDate('YYYY-MM-DD', date)).toBe('2024-01-15');
    });

    it('should format date with time', () => {
      const date = new Date(2024, 0, 15, 14, 30, 45);
      expect(formatDate('YYYY-MM-DD HH:mm:ss', date)).toBe('2024-01-15 14:30:45');
    });

    it('should handle YY format', () => {
      const date = new Date(2024, 0, 15);
      expect(formatDate('YY/MM/DD', date)).toBe('24/01/15');
    });
  });
});
