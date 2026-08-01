/**
 * Value generators.
 *
 * Randomness arrives through a {@link RandomSource} rather than being read
 * from `node:crypto` inline. In production that is the CSPRNG; in tests it is
 * a counter, which is the only way to assert that a UUID lays its bits out
 * the way the spec says.
 */

import { randomBytes } from 'node:crypto';

/** Source of cryptographically secure random bytes. */
export interface RandomSource {
  /** Returns exactly `count` random bytes. */
  bytes(count: number): Uint8Array;
}

/** The production {@link RandomSource}: Node's CSPRNG. */
export const cryptoRandom: RandomSource = {
  bytes: (count) => new Uint8Array(randomBytes(count)),
};

/** Formats 16 bytes as a canonical `8-4-4-4-12` UUID string. */
function formatUuid(bytes: Uint8Array): string {
  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Sets the 4-bit version and 2-bit variant fields required by RFC 9562 §4.1,
 * in place.
 */
function stampVersionAndVariant(bytes: Uint8Array, version: number): void {
  bytes[6] = ((bytes[6] as number) & 0x0f) | (version << 4);
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
}

/** Generates a random (version 4) UUID — RFC 9562 §5.4. */
export function uuidV4(random: RandomSource = cryptoRandom): string {
  const bytes = random.bytes(16);
  stampVersionAndVariant(bytes, 4);
  return formatUuid(bytes);
}

/**
 * Generates a time-ordered (version 7) UUID — RFC 9562 §5.7.
 *
 * The first 48 bits are the Unix timestamp in milliseconds, big-endian, so
 * lexicographic string order matches creation order. That is the property
 * v4 lacks and the reason v7 exists: as a database key, v7 keeps inserts
 * clustered at the end of the index instead of scattering them.
 *
 * @param now - Milliseconds since the Unix epoch
 * @param random - Source for the 74 random bits
 */
export function uuidV7(now: number, random: RandomSource = cryptoRandom): string {
  const bytes = new Uint8Array(16);

  // 48-bit big-endian millisecond timestamp. Written from the low byte up so
  // the arithmetic stays within the 2^53 integer range that bitwise
  // operators (32-bit) could not express.
  let remaining = Math.floor(now);
  for (let index = 5; index >= 0; index--) {
    bytes[index] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }

  bytes.set(random.bytes(10), 6);
  stampVersionAndVariant(bytes, 7);
  return formatUuid(bytes);
}

/** Character classes a generated password can draw from. */
export interface PasswordOptions {
  /** Total length. */
  length: number;
  /** Include `a`–`z` (default: true). */
  lowercase?: boolean;
  /** Include `A`–`Z` (default: true). */
  uppercase?: boolean;
  /** Include `0`–`9` (default: true). */
  digits?: boolean;
  /** Include punctuation (default: true). */
  symbols?: boolean;
  /**
   * Drop characters that are hard to tell apart in most fonts — `Il1|`,
   * `O0`, `` ` ``, `'`, `"` — for passwords that get read aloud or retyped
   * (default: false).
   */
  excludeAmbiguous?: boolean;
}

const CHARSETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!#$%&()*+,-./:;<=>?@[]^_{|}~',
} as const;

const AMBIGUOUS = new Set([...'Il1|O0`\'"']);

/**
 * Picks a uniformly distributed index below `bound`.
 *
 * Rejection sampling rather than `byte % bound`: taking the remainder of a
 * uniform byte biases the low indices whenever `bound` does not divide 256,
 * which for a 26-letter alphabet is a measurable skew.
 */
function randomIndex(random: RandomSource, bound: number): number {
  const limit = Math.floor(256 / bound) * bound;
  for (;;) {
    const byte = random.bytes(1)[0] as number;
    if (byte < limit) {
      return byte % bound;
    }
  }
}

/** Thrown when {@link generatePassword} is asked for something impossible. */
export class PasswordOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordOptionsError';
  }
}

/**
 * Generates a password containing at least one character from every enabled
 * class.
 *
 * The guaranteed characters are placed first and the whole result is then
 * shuffled, so their positions carry no information — a naive "one of each,
 * then fill" leaks that position 0 is always a lowercase letter.
 *
 * @throws {PasswordOptionsError} If no class is enabled, or `length` is too
 *   short to fit one character from each enabled class.
 */
export function generatePassword(
  options: PasswordOptions,
  random: RandomSource = cryptoRandom
): string {
  const enabled = (
    [
      ['lowercase', options.lowercase ?? true],
      ['uppercase', options.uppercase ?? true],
      ['digits', options.digits ?? true],
      ['symbols', options.symbols ?? true],
    ] as const
  )
    .filter(([, on]) => on)
    .map(([name]) => {
      const charset = CHARSETS[name];
      return options.excludeAmbiguous === true
        ? [...charset].filter((char) => !AMBIGUOUS.has(char)).join('')
        : charset;
    })
    .filter((charset) => charset.length > 0);

  if (enabled.length === 0) {
    throw new PasswordOptionsError('At least one character class must be enabled.');
  }
  if (options.length < enabled.length) {
    throw new PasswordOptionsError(
      `Length must be at least ${String(enabled.length)} to include every selected character class.`
    );
  }

  const all = enabled.join('');
  const chars = enabled.map((charset) => charset[randomIndex(random, charset.length)] as string);
  while (chars.length < options.length) {
    chars.push(all[randomIndex(random, all.length)] as string);
  }

  // Fisher-Yates, so the guaranteed-class characters are not pinned to the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(random, i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join('');
}

/**
 * Sentences cycled through to build placeholder text. Fixed rather than
 * randomly assembled: identical input producing identical output is worth
 * more here than novelty, because it makes the generator diffable and
 * testable.
 */
const LOREM_SENTENCES: readonly string[] = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
];

/**
 * Builds placeholder text.
 *
 * @param paragraphs - Number of paragraphs (clamped to at least 1)
 * @param sentencesPerParagraph - Sentences in each (clamped to at least 1)
 */
export function loremIpsum(paragraphs: number, sentencesPerParagraph = 5): string {
  const count = Math.max(1, Math.floor(paragraphs));
  const perParagraph = Math.max(1, Math.floor(sentencesPerParagraph));

  let sentence = 0;
  return Array.from({ length: count }, () =>
    Array.from({ length: perParagraph }, () => {
      const text = LOREM_SENTENCES[sentence % LOREM_SENTENCES.length] as string;
      sentence++;
      return text;
    }).join(' ')
  ).join('\n\n');
}
