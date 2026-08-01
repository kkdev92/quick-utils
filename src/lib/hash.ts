/**
 * Digests and message authentication codes, over Node's `crypto`.
 *
 * MD5 and SHA-1 are offered because checksums in the wild still use them
 * (package registries, legacy ETags, Gravatar); they are not collision
 * resistant and must not be used to authenticate anything. The HMAC
 * construction is a different matter — HMAC-SHA-1 is still sound — but SHA-256
 * is the sensible default, and the one `quickUtils.hashAlgorithm` starts at.
 */

import { createHash, createHmac } from 'node:crypto';

/** Digest algorithms this extension exposes. */
export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512';

/** Output encodings for a digest. */
export type DigestEncoding = 'hex' | 'base64';

/** Algorithms in the order they are presented to the user. */
export const HASH_ALGORITHMS: readonly HashAlgorithm[] = [
  'sha256',
  'sha512',
  'sha384',
  'sha1',
  'md5',
];

/** Algorithms that are broken for anything security-related. */
const LEGACY_ALGORITHMS: ReadonlySet<HashAlgorithm> = new Set<HashAlgorithm>(['md5', 'sha1']);

/**
 * Reports whether an algorithm is only fit for non-security checksums, so
 * the UI can say so at the point of choosing rather than after the fact.
 */
export function isLegacyAlgorithm(algorithm: HashAlgorithm): boolean {
  return LEGACY_ALGORITHMS.has(algorithm);
}

/**
 * Digests UTF-8 text.
 *
 * @param algorithm - Digest algorithm
 * @param input - Text to digest, interpreted as UTF-8
 * @param encoding - Output encoding (default: `hex`)
 */
export function hashText(
  algorithm: HashAlgorithm,
  input: string,
  encoding: DigestEncoding = 'hex'
): string {
  return createHash(algorithm).update(input, 'utf8').digest(encoding);
}

/** How the stored text of a signing secret should be read into key bytes. */
export type KeyEncoding = 'utf8' | 'hex' | 'base64';

/** Thrown when a secret's text does not match the encoding it was declared as. */
export class KeyEncodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyEncodingError';
  }
}

/**
 * Reads a secret's text into key bytes.
 *
 * The encoding matters more than it looks: a webhook secret printed as 64 hex
 * characters is 32 key bytes, not 64. Treating it as UTF-8 produces a
 * different key, and therefore a signature that never matches — with no error
 * anywhere to explain why. That failure mode is the reason this is explicit.
 *
 * @throws {KeyEncodingError} If the text is not valid for `encoding`.
 */
export function decodeKey(value: string, encoding: KeyEncoding): Uint8Array {
  if (encoding === 'utf8') {
    return new Uint8Array(Buffer.from(value, 'utf8'));
  }

  const compact = value.trim();
  if (encoding === 'hex') {
    if (!/^[0-9a-fA-F]*$/.test(compact) || compact.length % 2 !== 0) {
      throw new KeyEncodingError('The secret is not an even-length run of hex digits.');
    }
    return new Uint8Array(Buffer.from(compact, 'hex'));
  }

  // Base64: Buffer.from silently drops characters outside the alphabet, so the
  // round trip is what actually rejects a mistyped key.
  const bytes = Buffer.from(compact, 'base64');
  if (bytes.toString('base64').replace(/=+$/, '') !== compact.replace(/=+$/, '')) {
    throw new KeyEncodingError('The secret is not valid Base64.');
  }
  return new Uint8Array(bytes);
}

/**
 * Computes an HMAC over UTF-8 text.
 *
 * @param algorithm - Digest algorithm backing the HMAC
 * @param key - Shared secret. A string is read as UTF-8; pass bytes from
 *   {@link decodeKey} when the secret is really hex or Base64
 * @param input - Message to authenticate, interpreted as UTF-8
 * @param encoding - Output encoding (default: `hex`)
 */
export function hmacText(
  algorithm: HashAlgorithm,
  key: string | Uint8Array,
  input: string,
  encoding: DigestEncoding = 'hex'
): string {
  const keyBytes = typeof key === 'string' ? Buffer.from(key, 'utf8') : Buffer.from(key);
  return createHmac(algorithm, keyBytes).update(input, 'utf8').digest(encoding);
}
