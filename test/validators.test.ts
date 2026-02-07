import { describe, it, expect } from 'vitest';
import {
  isValidJson,
  isValidRegex,
  isValidBase64,
  isValidUuid,
  isValidUrl,
  isNonEmptyString,
  isInRange,
} from '../src/utils/validators.js';

describe('isValidJson', () => {
  it('accepts valid JSON', () => {
    expect(isValidJson('{}')).toBe(true);
    expect(isValidJson('[]')).toBe(true);
    expect(isValidJson('{"a":1}')).toBe(true);
    expect(isValidJson('"hello"')).toBe(true);
    expect(isValidJson('123')).toBe(true);
    expect(isValidJson('null')).toBe(true);
  });

  it('rejects invalid JSON', () => {
    expect(isValidJson('')).toBe(false);
    expect(isValidJson('{')).toBe(false);
    expect(isValidJson('{a:1}')).toBe(false);
    expect(isValidJson('undefined')).toBe(false);
  });
});

describe('isValidRegex', () => {
  it('accepts valid regex patterns', () => {
    expect(isValidRegex('hello')).toBe(true);
    expect(isValidRegex('^\\d+$')).toBe(true);
    expect(isValidRegex('[a-z]', 'gi')).toBe(true);
  });

  it('rejects invalid regex patterns', () => {
    expect(isValidRegex('[')).toBe(false);
    expect(isValidRegex('(?P<name>)')).toBe(false);
  });

  it('rejects invalid flags', () => {
    expect(isValidRegex('hello', 'z')).toBe(false);
  });
});

describe('isValidBase64', () => {
  it('accepts valid Base64 strings', () => {
    expect(isValidBase64('SGVsbG8=')).toBe(true);
    expect(isValidBase64('dGVzdA==')).toBe(true);
    expect(isValidBase64('YWJj')).toBe(true);
  });

  it('rejects empty strings', () => {
    expect(isValidBase64('')).toBe(false);
  });

  it('rejects invalid Base64 strings', () => {
    expect(isValidBase64('not base64!')).toBe(false);
    expect(isValidBase64('abc')).toBe(false); // not a multiple of 4
  });
});

describe('isValidUuid', () => {
  it('accepts valid UUIDs', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUuid('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
  });

  it('rejects invalid UUIDs', () => {
    expect(isValidUuid('')).toBe(false);
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('550e8400-e29b-41d4-a716')).toBe(false);
    expect(isValidUuid('550e8400e29b41d4a716446655440000')).toBe(false); // no hyphens
  });
});

describe('isValidUrl', () => {
  it('accepts valid URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost:3000/path')).toBe(true);
    expect(isValidUrl('ftp://files.example.com')).toBe(true);
  });

  it('rejects invalid URLs', () => {
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('example.com')).toBe(false); // no protocol
  });
});

describe('isNonEmptyString', () => {
  it('accepts non-empty strings', () => {
    expect(isNonEmptyString('hello')).toBe(true);
    expect(isNonEmptyString(' a ')).toBe(true);
  });

  it('rejects empty or whitespace-only strings', () => {
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString('   ')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isNonEmptyString(null)).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
    expect(isNonEmptyString(123)).toBe(false);
    expect(isNonEmptyString({})).toBe(false);
  });
});

describe('isInRange', () => {
  it('accepts values within range', () => {
    expect(isInRange(5, 1, 10)).toBe(true);
    expect(isInRange(1, 1, 10)).toBe(true);  // min boundary
    expect(isInRange(10, 1, 10)).toBe(true); // max boundary
  });

  it('rejects values outside range', () => {
    expect(isInRange(0, 1, 10)).toBe(false);
    expect(isInRange(11, 1, 10)).toBe(false);
    expect(isInRange(-1, 0, 100)).toBe(false);
  });
});
