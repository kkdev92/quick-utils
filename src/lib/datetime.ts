/**
 * Pattern-based date formatting.
 *
 * This is deliberately *not* locale-aware: a pattern like `YYYY-MM-DD`
 * produces the same string on every machine, which is what a timestamp
 * written into source code or a changelog needs. Localised output is a
 * separate concern, handled with the kit's `formatDate` where the user asks
 * for it.
 */

/** Tokens are matched longest-first within each letter, and `[...]` escapes literals. */
const TOKEN = /\[([^\]]*)\]|YYYY|YY|MM|M|DD|D|HH|H|hh|h|mm|m|SSS|ss|s|A|a|ZZ|Z/g;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/**
 * Formats the UTC offset as `+09:00` (`Z`) or `+0900` (`ZZ`).
 *
 * `getTimezoneOffset` reports minutes *behind* UTC, so a zone ahead of UTC
 * yields a negative number — hence the inverted sign.
 */
function offset(date: Date, colon: boolean): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  return `${sign}${pad(Math.floor(absolute / 60))}${colon ? ':' : ''}${pad(absolute % 60)}`;
}

/**
 * Formats `date` according to `pattern`.
 *
 * Supported tokens:
 *
 * | Token | Meaning | Example |
 * | --- | --- | --- |
 * | `YYYY` / `YY` | Year | `2026` / `26` |
 * | `MM` / `M` | Month | `07` / `7` |
 * | `DD` / `D` | Day of month | `04` / `4` |
 * | `HH` / `H` | Hour, 24-hour | `09` / `9` |
 * | `hh` / `h` | Hour, 12-hour | `09` / `9` |
 * | `mm` / `m` | Minute | `05` / `5` |
 * | `ss` / `s` | Second | `07` / `7` |
 * | `SSS` | Millisecond | `042` |
 * | `A` / `a` | Meridiem | `AM` / `am` |
 * | `Z` / `ZZ` | UTC offset | `+09:00` / `+0900` |
 *
 * Text inside square brackets is emitted literally: `YYYY-MM-DD[T]HH:mm:ss`.
 * Bracketing is not optional for prose — every token letter above is
 * substituted wherever it appears, so `Date: YYYY` would turn the `a` and the
 * `D` of "Date" into a meridiem and a day number. Write `[Date:] YYYY`.
 *
 * Weekday and month *names* are intentionally absent — they cannot be
 * produced without picking a language, which would make the output depend on
 * the editor's display language.
 */
export function formatDateTime(pattern: string, date: Date): string {
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return pattern.replace(TOKEN, (token, literal: string | undefined) => {
    if (literal !== undefined) {
      return literal;
    }
    switch (token) {
      case 'YYYY':
        return String(date.getFullYear());
      case 'YY':
        return pad(date.getFullYear() % 100);
      case 'MM':
        return pad(date.getMonth() + 1);
      case 'M':
        return String(date.getMonth() + 1);
      case 'DD':
        return pad(date.getDate());
      case 'D':
        return String(date.getDate());
      case 'HH':
        return pad(hours24);
      case 'H':
        return String(hours24);
      case 'hh':
        return pad(hours12);
      case 'h':
        return String(hours12);
      case 'mm':
        return pad(date.getMinutes());
      case 'm':
        return String(date.getMinutes());
      case 'ss':
        return pad(date.getSeconds());
      case 's':
        return String(date.getSeconds());
      case 'SSS':
        return pad(date.getMilliseconds(), 3);
      case 'A':
        return hours24 < 12 ? 'AM' : 'PM';
      case 'a':
        return hours24 < 12 ? 'am' : 'pm';
      case 'Z':
        return offset(date, true);
      case 'ZZ':
        return offset(date, false);
      default:
        return token;
    }
  });
}

/** Patterns offered in the date picker, in order. */
export const DATE_PATTERNS: readonly string[] = [
  'YYYY-MM-DD',
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DD[T]HH:mm:ssZ',
  'YYYY/MM/DD',
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'HH:mm:ss',
  'YYYYMMDD',
];

/** Whole seconds since the Unix epoch. */
export function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/** Milliseconds since the Unix epoch. */
export function toUnixMillis(date: Date): number {
  return date.getTime();
}

/** Thrown when a string cannot be read as a timestamp. */
export class TimestampParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimestampParseError';
  }
}

/**
 * Reads a numeric Unix timestamp, guessing the unit from magnitude:
 * 10 digits or fewer is seconds, more is milliseconds. That heuristic covers
 * the range 1973–5138 for seconds, which is every timestamp anyone pastes in
 * practice.
 *
 * @throws {TimestampParseError} If the input is not a non-negative integer.
 */
export function parseUnixTimestamp(input: string): Date {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new TimestampParseError('Input is not a whole number of seconds or milliseconds.');
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) {
    throw new TimestampParseError('Input is too large to be a timestamp.');
  }
  return new Date(trimmed.length <= 10 ? value * 1000 : value);
}
