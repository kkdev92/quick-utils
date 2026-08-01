import { describe, expect, it } from 'vitest';

import {
  PasswordOptionsError,
  cryptoRandom,
  generatePassword,
  loremIpsum,
  uuidV4,
  uuidV7,
  type RandomSource,
} from '../../src/lib/generate';

/** A predictable byte source, so the layout of a UUID can be asserted exactly. */
function sequence(start = 0): RandomSource {
  let next = start;
  return {
    bytes: (count) => Uint8Array.from({ length: count }, () => next++ & 0xff),
  };
}

/** Every byte the same, for asserting which bits a version stamp overwrites. */
function constant(value: number): RandomSource {
  return { bytes: (count) => new Uint8Array(count).fill(value) };
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('uuidV4', () => {
  it('produces the canonical shape', () => {
    expect(uuidV4(sequence())).toMatch(UUID_SHAPE);
  });

  it('stamps version 4 and the RFC 9562 variant', () => {
    const uuid = uuidV4(constant(0xff));
    expect(uuid[14]).toBe('4');
    // Variant bits are 10, so the nibble is 8, 9, a or b.
    expect(uuid[19]).toBe('b');
  });

  it('keeps the random bits it is given', () => {
    expect(uuidV4(sequence())).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });

  it('differs between calls when using the real CSPRNG', () => {
    expect(uuidV4(cryptoRandom)).not.toBe(uuidV4(cryptoRandom));
  });
});

describe('uuidV7', () => {
  it('encodes the timestamp in the first 48 bits, big-endian', () => {
    const uuid = uuidV7(0x0123456789ab, constant(0));
    expect(uuid.startsWith('01234567-89ab-')).toBe(true);
  });

  it('stamps version 7 and the variant', () => {
    const uuid = uuidV7(0, constant(0xff));
    expect(uuid[14]).toBe('7');
    expect(uuid[19]).toBe('b');
  });

  it('sorts lexicographically in creation order', () => {
    const early = uuidV7(1_700_000_000_000, constant(0xff));
    const late = uuidV7(1_800_000_000_000, constant(0x00));
    // Even with a larger random tail, the earlier timestamp must sort first.
    expect([late, early].sort()).toEqual([early, late]);
  });

  it('handles a millisecond value above the 32-bit range', () => {
    // 2026-07-31 is ~1.78e12 ms, beyond what bitwise operators can express.
    expect(uuidV7(1_785_000_000_000, constant(0))).toMatch(UUID_SHAPE);
  });

  it('truncates a fractional timestamp rather than corrupting the layout', () => {
    expect(uuidV7(1_700_000_000_000.9, constant(0))).toBe(
      uuidV7(1_700_000_000_000, constant(0))
    );
  });
});

describe('generatePassword', () => {
  it('honours the requested length', () => {
    expect(generatePassword({ length: 24 }, cryptoRandom)).toHaveLength(24);
  });

  it('includes at least one character from every enabled class', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const password = generatePassword({ length: 8 }, cryptoRandom);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!#$%&()*+,\-./:;<=>?@[\]^_{|}~]/);
    }
  });

  it('draws only from the enabled classes', () => {
    const password = generatePassword(
      { length: 20, uppercase: false, symbols: false },
      cryptoRandom
    );
    expect(password).toMatch(/^[a-z0-9]+$/);
  });

  it('excludes look-alike characters on request', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      expect(generatePassword({ length: 40, excludeAmbiguous: true }, cryptoRandom)).not.toMatch(
        /[Il1|O0`'"]/
      );
    }
  });

  it('does not pin the guaranteed characters to the front', () => {
    // With a shuffle, the first character varies across runs; without one it
    // would always be lowercase.
    const firsts = new Set(
      Array.from({ length: 40 }, () => generatePassword({ length: 8 }, cryptoRandom)[0])
    );
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('rejects having no class enabled', () => {
    expect(() =>
      generatePassword(
        { length: 10, lowercase: false, uppercase: false, digits: false, symbols: false },
        cryptoRandom
      )
    ).toThrow(PasswordOptionsError);
  });

  it('rejects a length too short to fit one of each class', () => {
    expect(() => generatePassword({ length: 3 }, cryptoRandom)).toThrow(/at least 4/);
  });

  it('distributes indices without the modulo bias of a raw byte', () => {
    // Rejection sampling must discard bytes at or above the largest multiple of
    // the alphabet size. Feeding 255 first (rejected for a 26-letter class)
    // proves it retries instead of folding it to index 255 % 26.
    const bytes = [255, 0];
    let index = 0;
    const source: RandomSource = {
      bytes: () => new Uint8Array([bytes[Math.min(index++, bytes.length - 1)] as number]),
    };
    expect(
      generatePassword(
        { length: 1, uppercase: false, digits: false, symbols: false },
        source
      )
    ).toBe('a');
  });
});

describe('loremIpsum', () => {
  it('joins paragraphs with a blank line', () => {
    expect(loremIpsum(3).split('\n\n')).toHaveLength(3);
  });

  it('is deterministic', () => {
    expect(loremIpsum(2)).toBe(loremIpsum(2));
  });

  it('clamps a nonsensical count to one paragraph', () => {
    expect(loremIpsum(0).split('\n\n')).toHaveLength(1);
    expect(loremIpsum(-5, 0).split('\n\n')).toHaveLength(1);
  });

  it('honours the sentences-per-paragraph count', () => {
    expect(loremIpsum(1, 2).match(/\./g)).toHaveLength(2);
  });

  it('cycles through the sentence pool rather than repeating one', () => {
    const paragraph = loremIpsum(1, 3);
    const sentences = paragraph.split('. ');
    expect(new Set(sentences).size).toBe(sentences.length);
  });
});
