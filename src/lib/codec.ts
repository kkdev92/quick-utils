/**
 * Encoding and decoding.
 *
 * Every decoder here is strict: it rejects malformed input with a
 * {@link DecodeError} instead of returning something plausible-looking.
 * That matters because these run against whatever the user happened to have
 * selected — `Buffer.from(text, 'base64')` silently skips characters outside
 * the alphabet, so a decode of prose would "succeed" and replace the
 * selection with garbage.
 */

/** Thrown when input is not valid for the codec being applied. */
export class DecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecodeError';
  }
}

/** Encodes UTF-8 text as standard Base64 (RFC 4648 §4, padded). */
export function base64Encode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64');
}

/** Encodes UTF-8 text as URL-safe Base64 (RFC 4648 §5, unpadded). */
export function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

const BASE64_STANDARD = /^[A-Za-z0-9+/]*={0,2}$/;
const BASE64_URL = /^[A-Za-z0-9_-]*$/;

/**
 * Decodes Base64 (standard or URL-safe, padded or not) to UTF-8 text.
 *
 * Validation happens in three stages, because each catches a different way
 * for the input to be wrong:
 *
 * 1. alphabet — rejects text that simply is not Base64
 * 2. length — a 4-character group encodes 3 bytes, so a 1-character remainder
 *    cannot encode anything; 2 and 3 are the legitimate partial groups
 * 3. UTF-8 — the bytes may decode fine and still not be text, so the result
 *    is re-encoded and compared; a mismatch means `toString('utf8')`
 *    substituted U+FFFD for invalid sequences
 *
 * Padding is not required to be correct — it is stripped before the length
 * check — because plenty of encoders omit it entirely, and rejecting
 * `aGVsbG8` while accepting `aGVsbG8=` would be a surprising place to be
 * strict.
 *
 * @throws {DecodeError} If any stage fails.
 */
export function base64Decode(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new DecodeError('Input is empty.');
  }

  const isUrlSafe = BASE64_URL.test(trimmed) && /[_-]/.test(trimmed);
  if (!isUrlSafe && !BASE64_STANDARD.test(trimmed)) {
    throw new DecodeError('Input contains characters outside the Base64 alphabet.');
  }

  const body = trimmed.replace(/=+$/, '');
  if (body.length % 4 === 1) {
    throw new DecodeError('Input length is not valid for Base64.');
  }

  const bytes = Buffer.from(body, isUrlSafe ? 'base64url' : 'base64');
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    throw new DecodeError('Input decodes to bytes that are not valid UTF-8 text.');
  }
  return text;
}

/** Percent-encodes text with `encodeURIComponent`. */
export function urlEncode(input: string): string {
  return encodeURIComponent(input);
}

/**
 * Decodes percent-encoded text.
 *
 * @throws {DecodeError} If the input contains a malformed escape sequence.
 */
export function urlDecode(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    // decodeURIComponent throws a bare URIError with no detail about where.
    throw new DecodeError('Input contains a malformed percent-escape sequence.');
  }
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes the five characters that are unsafe in HTML text and attribute
 * values. `'` becomes the numeric `&#39;` rather than `&apos;`, which older
 * HTML parsers do not recognise.
 */
export function htmlEscape(input: string): string {
  return input.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] as string);
}

const HTML_NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  // U+00A0, not a plain space: unescaping should recover the character the
  // reference stood for, and collapsing it to U+0020 would quietly change how
  // the text wraps.
  nbsp: ' ',
};

/**
 * Reverses {@link htmlEscape}, plus numeric character references.
 *
 * Only the named entities above are recognised — resolving the full HTML
 * entity table would mean shipping it, and these are the ones that appear
 * in escaped source. Unrecognised entities are left as-is rather than
 * dropped, so nothing is silently lost.
 */
export function htmlUnescape(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (entity, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const codePoint = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      // Surrogates and out-of-range values have no scalar value to produce.
      if (!Number.isInteger(codePoint) || codePoint > 0x10ffff) {
        return entity;
      }
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
        return entity;
      }
      return String.fromCodePoint(codePoint);
    }
    return HTML_NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

/** Encodes UTF-8 text as lowercase hexadecimal. */
export function hexEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('hex');
}

/**
 * Decodes hexadecimal to UTF-8 text. Whitespace between bytes (as produced
 * by hex dumps) is ignored.
 *
 * @throws {DecodeError} If the input is not an even-length run of hex digits,
 *   or does not decode to valid UTF-8.
 */
export function hexDecode(input: string): string {
  const compact = input.replace(/\s+/g, '');
  if (compact.length === 0) {
    throw new DecodeError('Input is empty.');
  }
  if (!/^[0-9a-fA-F]+$/.test(compact)) {
    throw new DecodeError('Input contains characters that are not hexadecimal digits.');
  }
  if (compact.length % 2 !== 0) {
    throw new DecodeError('Input has an odd number of hex digits, so it cannot be whole bytes.');
  }

  const bytes = Buffer.from(compact, 'hex');
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    throw new DecodeError('Input decodes to bytes that are not valid UTF-8 text.');
  }
  return text;
}

/**
 * Escapes text for use inside a JSON string literal, without the
 * surrounding quotes.
 */
export function jsonStringEscape(input: string): string {
  return JSON.stringify(input).slice(1, -1);
}

/**
 * Reverses {@link jsonStringEscape}.
 *
 * @throws {DecodeError} If the input is not a valid JSON string body — an
 *   unescaped quote or a truncated `\u` escape both land here.
 */
export function jsonStringUnescape(input: string): string {
  try {
    const parsed: unknown = JSON.parse(`"${input}"`);
    // JSON.parse of a quoted body can only yield a string.
    return parsed as string;
  } catch {
    throw new DecodeError('Input is not a valid JSON string body.');
  }
}

/** Every codec {@link applyCodec} can apply. */
export type CodecOperation =
  | 'base64Encode'
  | 'base64Decode'
  | 'base64UrlEncode'
  | 'urlEncode'
  | 'urlDecode'
  | 'htmlEscape'
  | 'htmlUnescape'
  | 'hexEncode'
  | 'hexDecode'
  | 'jsonEscape'
  | 'jsonUnescape';

const CODECS: Record<CodecOperation, (input: string) => string> = {
  base64Encode,
  base64Decode,
  base64UrlEncode,
  urlEncode,
  urlDecode,
  htmlEscape,
  htmlUnescape,
  hexEncode,
  hexDecode,
  jsonEscape: jsonStringEscape,
  jsonUnescape: jsonStringUnescape,
};

/**
 * Applies the named codec.
 *
 * @throws {DecodeError} From any decoding operation, on malformed input.
 */
export function applyCodec(operation: CodecOperation, input: string): string {
  return CODECS[operation](input);
}
