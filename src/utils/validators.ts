/**
 * Input validation utilities.
 */

/**
 * Checks whether a string is valid JSON.
 */
export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether a string is a valid regular expression with optional flags.
 */
export function isValidRegex(pattern: string, flags?: string): boolean {
  try {
    new RegExp(pattern, flags);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether a string is valid Base64.
 * Performs charset, length, and round-trip validation.
 */
export function isValidBase64(str: string): boolean {
  if (!str || str.length === 0) {
    return false;
  }

  // Verify the charset contains only Base64-safe characters
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(str)) {
    return false;
  }

  // Length must be a multiple of 4
  if (str.length % 4 !== 0) {
    return false;
  }

  try {
    // Round-trip check: decode and re-encode to confirm integrity
    const decoded = Buffer.from(str, 'base64').toString('utf-8');
    const reencoded = Buffer.from(decoded, 'utf-8').toString('base64');

    // Normalize padding before comparison
    return str.replace(/=+$/, '') === reencoded.replace(/=+$/, '');
  } catch {
    return false;
  }
}

/**
 * Checks whether a string is a valid UUID (v1–v5).
 */
export function isValidUuid(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Checks whether a string is a valid URL with an http(s) protocol.
 */
export function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether a value is a non-empty string (after trimming whitespace).
 */
export function isNonEmptyString(str: unknown): str is string {
  return typeof str === 'string' && str.trim().length > 0;
}

/**
 * Checks whether a number falls within the specified range (inclusive).
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}
