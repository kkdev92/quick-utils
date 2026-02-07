/**
 * String transformation utilities (pure functions).
 */

/**
 * Splits a string into individual words by detecting case boundaries and separators.
 */
function splitIntoWords(str: string): string[] {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase -> camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // XMLParser -> XML Parser
    .replace(/[-_]/g, ' ') // kebab-case, snake_case -> spaces
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/**
 * Converts a string to UPPER CASE.
 */
export function toUpperCase(str: string): string {
  return str.toUpperCase();
}

/**
 * Converts a string to lower case.
 */
export function toLowerCase(str: string): string {
  return str.toLowerCase();
}

/**
 * Converts a string to camelCase.
 */
export function toCamelCase(str: string): string {
  const words = splitIntoWords(str);
  if (words.length === 0) {return '';}

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0) {return lower;}
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

/**
 * Converts a string to PascalCase.
 */
export function toPascalCase(str: string): string {
  const words = splitIntoWords(str);
  if (words.length === 0) {return '';}

  return words
    .map((word) => {
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

/**
 * Converts a string to snake_case.
 */
export function toSnakeCase(str: string): string {
  const words = splitIntoWords(str);
  return words.map((word) => word.toLowerCase()).join('_');
}

/**
 * Converts a string to kebab-case.
 */
export function toKebabCase(str: string): string {
  const words = splitIntoWords(str);
  return words.map((word) => word.toLowerCase()).join('-');
}

/**
 * Encodes a UTF-8 string to Base64.
 */
export function base64Encode(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

/**
 * Decodes a Base64 string to UTF-8.
 */
export function base64Decode(str: string): string {
  return Buffer.from(str, 'base64').toString('utf-8');
}

/**
 * URL-encodes a string using `encodeURIComponent`.
 */
export function urlEncode(str: string): string {
  return encodeURIComponent(str);
}

/**
 * URL-decodes a string using `decodeURIComponent`.
 */
export function urlDecode(str: string): string {
  return decodeURIComponent(str);
}

/**
 * Formats a JSON string with indentation.
 */
export function formatJson(str: string, indent: number = 2): string {
  const parsed: unknown = JSON.parse(str);
  return JSON.stringify(parsed, null, indent);
}

/**
 * Minifies a JSON string by removing all whitespace.
 */
export function minifyJson(str: string): string {
  const parsed: unknown = JSON.parse(str);
  return JSON.stringify(parsed);
}

/**
 * Generates a random UUID v4.
 */
export function generateUuid(): string {
  return crypto.randomUUID();
}

/**
 * Generates placeholder Lorem Ipsum text.
 */
export function generateLoremIpsum(paragraphs: number = 1): string {
  const lorem =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

  return Array(paragraphs).fill(lorem).join('\n\n');
}

/**
 * Formats a {@link Date} according to the given format string.
 * Supported tokens: YYYY, YY, MM, DD, HH, mm, ss.
 */
export function formatDate(format: string, date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  const replacements: Record<string, string> = {
    YYYY: String(year),
    YY: String(year).slice(-2),
    MM: month,
    DD: day,
    HH: hours,
    mm: minutes,
    ss: seconds,
  };

  // Longest-first single-pass replacement so YYYY matches before YY
  return format.replace(/YYYY|YY|MM|DD|HH|mm|ss/g, (match) => replacements[match]);
}

/**
 * All supported text transformation types.
 */
export type TransformType =
  | 'uppercase'
  | 'lowercase'
  | 'camelCase'
  | 'pascalCase'
  | 'snakeCase'
  | 'kebabCase'
  | 'base64Encode'
  | 'base64Decode'
  | 'urlEncode'
  | 'urlDecode';

/**
 * Returns the transformer function for the given {@link TransformType}.
 */
export function getTransformer(type: TransformType): (str: string) => string {
  const transformers: Record<TransformType, (str: string) => string> = {
    uppercase: toUpperCase,
    lowercase: toLowerCase,
    camelCase: toCamelCase,
    pascalCase: toPascalCase,
    snakeCase: toSnakeCase,
    kebabCase: toKebabCase,
    base64Encode: base64Encode,
    base64Decode: base64Decode,
    urlEncode: urlEncode,
    urlDecode: urlDecode,
  };

  return transformers[type];
}
