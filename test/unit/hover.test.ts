/**
 * What the decode hover decides to show.
 *
 * `readToken` is the whole of that decision and needs no editor, so this is
 * where the guesswork lives: which shapes are worth decoding, and — more
 * importantly — which ones are not. A hover that fires on every long word in
 * the file is worse than no hover.
 */

import { describe, expect, it } from 'vitest';

import { readToken } from '../../src/features/hover';
import type { LocalizationService } from '@kkdev92/vscode-ext-kit';

/** Just enough of the service to label a reading. */
const l10n = { t: (message: string) => message } as unknown as LocalizationService;

const read = (token: string): { kind: string; value: string } | undefined =>
  readToken(token, l10n);

describe('readToken', () => {
  it('reads a ten-digit number as a date', () => {
    const reading = read('1700000000');

    expect(reading?.kind).toBe('Unix timestamp');
    // The value is rendered in local time, so asserting an absolute string
    // would make this pass or fail by machine. The shape is what matters.
    expect(reading?.value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u);
  });

  it('guesses the unit from magnitude, so seconds and millis agree', () => {
    // Same instant, written two ways. This is the whole of the heuristic, and
    // it holds in any timezone.
    expect(read('1700000000')?.value).toBe(read('1700000000000')?.value);
  });

  it('leaves numbers outside the plausible range alone', () => {
    // A version, a port, an id. Digit count is the only signal there is, so the
    // bound is what stops every long number sprouting a hover.
    expect(read('12345')).toBeUndefined();
    expect(read('99999999999999999999')).toBeUndefined();
  });

  it('decodes hex that spells out text', () => {
    expect(read('68656c6c6f')).toEqual({ kind: 'Hex', value: 'hello' });
    expect(read('0x68656c6c6f')).toEqual({ kind: 'Hex', value: 'hello' });
  });

  it('says nothing about hex that decodes to bytes', () => {
    // A sha256 digest is valid hex and means nothing as text; showing the
    // mojibake would be worse than showing nothing.
    expect(read('0001020304050607')).toBeUndefined();
  });

  it('ignores an odd number of hex digits', () => {
    expect(read('68656c6c6')).toBeUndefined();
  });

  it('decodes base64 that produces text', () => {
    expect(read('aGVsbG8gd29ybGQ=')).toEqual({ kind: 'Base64', value: 'hello world' });
  });

  it('keeps quiet about a plain word that happens to be valid base64', () => {
    // `test` decodes to bytes; `dGVzdA==` is the interesting direction.
    expect(read('somewordhere')?.kind).not.toBe('Base64');
  });

  it('prefers a timestamp reading over a hex one', () => {
    // `1700000000` is both. Someone who pasted it meant the date.
    expect(read('1700000000')?.kind).toBe('Unix timestamp');
  });

  it('has nothing to say about ordinary identifiers', () => {
    for (const token of ['getUserById', 'quick-utils', 'README']) {
      expect(read(token)).toBeUndefined();
    }
  });
});
