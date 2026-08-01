import { describe, expect, it } from 'vitest';

import {
  DATE_PATTERNS,
  TimestampParseError,
  formatDateTime,
  parseUnixTimestamp,
  toUnixMillis,
  toUnixSeconds,
} from '../../src/lib/datetime';

/** 2026-07-04 09:05:07.042 local time. */
const sample = new Date(2026, 6, 4, 9, 5, 7, 42);
/** 2026-07-04 15:30:00 local time — an afternoon, for the 12-hour tokens. */
const afternoon = new Date(2026, 6, 4, 15, 30, 0, 0);
/** Midnight, where 12-hour formatting has to say 12 rather than 0. */
const midnight = new Date(2026, 6, 4, 0, 30, 0, 0);

describe('formatDateTime', () => {
  it('formats the date tokens', () => {
    expect(formatDateTime('YYYY-MM-DD', sample)).toBe('2026-07-04');
    expect(formatDateTime('YY/M/D', sample)).toBe('26/7/4');
  });

  it('formats the time tokens', () => {
    expect(formatDateTime('HH:mm:ss.SSS', sample)).toBe('09:05:07.042');
    expect(formatDateTime('H:m:s', sample)).toBe('9:5:7');
  });

  it('formats 12-hour time with a meridiem', () => {
    expect(formatDateTime('hh:mm A', afternoon)).toBe('03:30 PM');
    expect(formatDateTime('h:mm a', afternoon)).toBe('3:30 pm');
  });

  it('renders midnight as 12, not 0', () => {
    expect(formatDateTime('hh:mm A', midnight)).toBe('12:30 AM');
  });

  it('emits bracketed text literally', () => {
    expect(formatDateTime('YYYY-MM-DD[T]HH:mm:ss', sample)).toBe('2026-07-04T09:05:07');
    expect(formatDateTime('[Date:] YYYY', sample)).toBe('Date: 2026');
  });

  it('leaves an empty bracket pair as nothing', () => {
    expect(formatDateTime('YYYY[]MM', sample)).toBe('202607');
  });

  it('formats the UTC offset in both shapes', () => {
    const withColon = formatDateTime('Z', sample);
    const withoutColon = formatDateTime('ZZ', sample);
    expect(withColon).toMatch(/^[+-]\d{2}:\d{2}$/);
    expect(withoutColon).toBe(withColon.replace(':', ''));
  });

  it('agrees with getTimezoneOffset about the sign', () => {
    // getTimezoneOffset is minutes *behind* UTC, so a zone ahead of UTC is
    // negative there and '+' here.
    const expected = sample.getTimezoneOffset() <= 0 ? '+' : '-';
    expect(formatDateTime('Z', sample).startsWith(expected)).toBe(true);
  });

  it('leaves unknown text untouched when it contains no tokens', () => {
    expect(formatDateTime('---', sample)).toBe('---');
  });

  it('formats every shipped pattern without leaving a token behind', () => {
    for (const pattern of DATE_PATTERNS) {
      const formatted = formatDateTime(pattern, sample);
      expect(formatted).not.toMatch(/[YMDHhmsSAaZ]{2,}/);
      expect(formatted.length).toBeGreaterThan(0);
    }
  });
});

describe('unix timestamps', () => {
  it('converts to seconds and milliseconds', () => {
    const date = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 500));
    expect(toUnixMillis(date)).toBe(date.getTime());
    // Seconds truncate rather than round, so the trailing 500ms is dropped.
    expect(toUnixSeconds(date)).toBe(Math.floor(date.getTime() / 1000));
  });

  it('reads a 10-digit value as seconds', () => {
    expect(parseUnixTimestamp('1767225600').toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('reads a longer value as milliseconds', () => {
    expect(parseUnixTimestamp('1767225600123').toISOString()).toBe('2026-01-01T00:00:00.123Z');
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseUnixTimestamp(' 0 ').getTime()).toBe(0);
  });

  it('rejects anything that is not a whole non-negative number', () => {
    for (const input of ['', 'abc', '-1', '1.5', '1e3']) {
      expect(() => parseUnixTimestamp(input)).toThrow(TimestampParseError);
    }
  });

  it('rejects a value beyond safe integer precision', () => {
    expect(() => parseUnixTimestamp('9'.repeat(20))).toThrow(/too large/);
  });
});
