import { describe, expect, it } from 'vitest';

import {
  HASH_ALGORITHMS,
  KeyEncodingError,
  decodeKey,
  hashText,
  hmacText,
  isLegacyAlgorithm,
  type HashAlgorithm,
} from '../../src/lib/hash';

describe('hashText', () => {
  it('matches the published SHA-256 of the empty string', () => {
    expect(hashText('sha256', '')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('matches the published SHA-1 and MD5 of "abc"', () => {
    expect(hashText('sha1', 'abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(hashText('md5', 'abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });

  it('encodes as base64 on request', () => {
    expect(hashText('sha256', 'abc', 'base64')).toBe(
      'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0='
    );
  });

  it('treats input as UTF-8, so non-ASCII changes the digest', () => {
    expect(hashText('sha256', '日本語')).toBe(
      hashText('sha256', Buffer.from('日本語', 'utf8').toString('utf8'))
    );
    expect(hashText('sha256', 'a')).not.toBe(hashText('sha256', 'á'));
  });

  it('produces the expected digest length for every offered algorithm', () => {
    const bits: Record<HashAlgorithm, number> = {
      md5: 128,
      sha1: 160,
      sha256: 256,
      sha384: 384,
      sha512: 512,
    };
    for (const algorithm of HASH_ALGORITHMS) {
      expect(hashText(algorithm, 'x')).toHaveLength(bits[algorithm] / 4);
    }
  });
});

describe('hmacText', () => {
  it('matches RFC 4231 test case 1 for HMAC-SHA-256', () => {
    expect(hmacText('sha256', '\x0b'.repeat(20), 'Hi There')).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
    );
  });

  it('depends on the key', () => {
    expect(hmacText('sha256', 'k1', 'msg')).not.toBe(hmacText('sha256', 'k2', 'msg'));
  });

  it('differs from a plain digest of key + message', () => {
    expect(hmacText('sha256', 'key', 'msg')).not.toBe(hashText('sha256', 'keymsg'));
  });

  it('encodes as base64 on request', () => {
    expect(hmacText('sha256', 'key', 'msg', 'base64')).toBe(
      Buffer.from(hmacText('sha256', 'key', 'msg'), 'hex').toString('base64')
    );
  });
});

describe('isLegacyAlgorithm', () => {
  it('flags exactly MD5 and SHA-1', () => {
    expect(HASH_ALGORITHMS.filter(isLegacyAlgorithm)).toEqual(['sha1', 'md5']);
  });

  it('puts a modern default first in the offered order', () => {
    expect(isLegacyAlgorithm(HASH_ALGORITHMS[0] as HashAlgorithm)).toBe(false);
  });
});

describe('decodeKey', () => {
  it('reads text as UTF-8 bytes', () => {
    expect(Buffer.from(decodeKey('abc', 'utf8')).toString('utf8')).toBe('abc');
    expect(decodeKey('日本', 'utf8')).toHaveLength(6);
  });

  it('reads hex as half as many bytes as characters', () => {
    // The whole point of the setting: 64 hex characters are a 32-byte key.
    expect(decodeKey('a'.repeat(64), 'hex')).toHaveLength(32);
    expect(Buffer.from(decodeKey('6869', 'hex')).toString('utf8')).toBe('hi');
  });

  it('reads Base64', () => {
    expect(Buffer.from(decodeKey('aGk=', 'base64')).toString('utf8')).toBe('hi');
  });

  it('tolerates surrounding whitespace on the encoded forms', () => {
    expect(decodeKey('  6869\n', 'hex')).toHaveLength(2);
    expect(decodeKey(' aGk= ', 'base64')).toHaveLength(2);
  });

  it('rejects hex that is not whole bytes', () => {
    expect(() => decodeKey('abc', 'hex')).toThrow(KeyEncodingError);
    expect(() => decodeKey('zz', 'hex')).toThrow(KeyEncodingError);
  });

  it('rejects Base64 that Buffer would otherwise silently repair', () => {
    // Buffer.from drops characters outside the alphabet, which would turn a
    // mistyped key into a valid-looking but wrong one.
    expect(() => decodeKey('not base64!', 'base64')).toThrow(KeyEncodingError);
  });

  it('never rejects UTF-8, because every string is valid UTF-8', () => {
    expect(() => decodeKey('!!! not hex !!!', 'utf8')).not.toThrow();
  });

  it('produces a different HMAC per encoding, which is why the setting exists', () => {
    const secret = 'deadbeef';
    const asText = hmacText('sha256', decodeKey(secret, 'utf8'), 'payload');
    const asHex = hmacText('sha256', decodeKey(secret, 'hex'), 'payload');
    expect(asText).not.toBe(asHex);
  });

  it('accepts bytes and the equivalent string interchangeably', () => {
    expect(hmacText('sha256', 'key', 'msg')).toBe(
      hmacText('sha256', decodeKey('key', 'utf8'), 'msg')
    );
  });
});
