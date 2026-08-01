/**
 * Case conversion.
 *
 * Every style shares one segmentation pass, so `splitWords` is the single
 * place that decides what counts as a word boundary and the rest is
 * formatting.
 */

/** Separators that always end a word, regardless of surrounding case. */
const SEPARATORS = /[\s\-_./\\:]+/u;

/**
 * Splits an identifier or phrase into words.
 *
 * Boundaries recognised, in addition to {@link SEPARATORS}:
 *
 * - lower/digit → upper (`fooBar` → `foo`, `Bar`)
 * - acronym → word (`XMLHttpRequest` → `XML`, `Http`, `Request`)
 *
 * Digits stay attached to the word they follow (`html5Parser` → `html5`,
 * `Parser`), matching what identifier-casing tools conventionally do — a
 * version number in a name is part of the name, not a word of its own.
 *
 * Unicode-aware: the case transitions use `\p{Ll}`/`\p{Lu}` rather than
 * `[a-z]`/`[A-Z}`, so accented and non-Latin scripts segment correctly.
 */
export function splitWords(input: string): string[] {
  return input
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(SEPARATORS)
    .filter((word) => word.length > 0);
}

/**
 * Upper-cases the first character and lower-cases the rest.
 *
 * Uses `codePointAt` rather than `charAt` so an astral-plane first
 * character (e.g. Deseret `𐐨`, which does have a case mapping) is not split
 * mid-surrogate-pair.
 */
function capitalize(word: string): string {
  if (word.length === 0) {
    return word;
  }
  const first = String.fromCodePoint(word.codePointAt(0) as number);
  return first.toUpperCase() + word.slice(first.length).toLowerCase();
}

/** Every case style {@link convertCase} can apply. */
export type CaseStyle =
  | 'upper'
  | 'lower'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'kebab'
  | 'constant'
  | 'title';

/**
 * `UPPER CASE` — the whole string, separators and all.
 *
 * Deliberately not word-based: upper-casing is the one style where callers
 * expect punctuation and spacing to survive untouched.
 */
export function toUpperCase(input: string): string {
  return input.toUpperCase();
}

/** `lower case` — the whole string, separators and all. */
export function toLowerCase(input: string): string {
  return input.toLowerCase();
}

/** `camelCase` */
export function toCamelCase(input: string): string {
  return splitWords(input)
    .map((word, index) => (index === 0 ? word.toLowerCase() : capitalize(word)))
    .join('');
}

/** `PascalCase` */
export function toPascalCase(input: string): string {
  return splitWords(input).map(capitalize).join('');
}

/** `snake_case` */
export function toSnakeCase(input: string): string {
  return splitWords(input)
    .map((word) => word.toLowerCase())
    .join('_');
}

/** `kebab-case` */
export function toKebabCase(input: string): string {
  return splitWords(input)
    .map((word) => word.toLowerCase())
    .join('-');
}

/** `CONSTANT_CASE` */
export function toConstantCase(input: string): string {
  return splitWords(input)
    .map((word) => word.toUpperCase())
    .join('_');
}

/** `Title Case` */
export function toTitleCase(input: string): string {
  return splitWords(input).map(capitalize).join(' ');
}

const CONVERTERS: Record<CaseStyle, (input: string) => string> = {
  upper: toUpperCase,
  lower: toLowerCase,
  camel: toCamelCase,
  pascal: toPascalCase,
  snake: toSnakeCase,
  kebab: toKebabCase,
  constant: toConstantCase,
  title: toTitleCase,
};

/** Applies the named case style. */
export function convertCase(style: CaseStyle, input: string): string {
  return CONVERTERS[style](input);
}
