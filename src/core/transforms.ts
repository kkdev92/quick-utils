/**
 * The transform registry.
 *
 * One list drives the picker, the individual commands, the tools view and the
 * "transform again" / history lookups — so adding a transform in one place
 * makes it available everywhere, and an id in stored history always resolves
 * back to the same operation.
 *
 * Host concerns (the JSON indent setting, the segmentation locale) arrive as
 * thunks rather than being read here, which keeps this module free of
 * `vscode` and therefore unit-testable on its own.
 */

import { convertCase } from '../lib/case';
import { applyCodec } from '../lib/codec';
import { formatJson, minifyJson, sortJsonKeys } from '../lib/json';
import { applyLineOperation } from '../lib/text';
import { COMMANDS } from './constants';
import { translatable } from './i18n';
import type { TransformDescriptor } from './types';

/** Host-provided values the JSON and line transforms depend on. */
export interface TransformDeps {
  /** Indentation for the JSON transforms, resolved from settings. */
  jsonIndent: () => number | '\t';
  /** Locale driving line-sort collation, from the editor's display language. */
  locale: () => string;
}

/** A registry of transforms, indexed for lookup by id. */
export interface TransformRegistry {
  /** Every transform, in display order. */
  readonly all: readonly TransformDescriptor[];
  /** Looks up a transform by id. */
  get(id: string): TransformDescriptor | undefined;
  /** Reports whether an id resolves — used to validate persisted ids. */
  has(id: string): boolean;
}

/** Builds the registry. */
export function createTransformRegistry(deps: TransformDeps): TransformRegistry {
  const all: TransformDescriptor[] = [
    {
      id: 'case.upper',
      kind: 'case',
      label: translatable('UPPER CASE'),
      icon: 'arrow-up',
      apply: (input) => convertCase('upper', input),
      command: COMMANDS.UPPER_CASE,
    },
    {
      id: 'case.lower',
      kind: 'case',
      label: translatable('lower case'),
      icon: 'arrow-down',
      apply: (input) => convertCase('lower', input),
      command: COMMANDS.LOWER_CASE,
    },
    {
      id: 'case.camel',
      kind: 'case',
      label: translatable('camelCase'),
      icon: 'symbol-method',
      apply: (input) => convertCase('camel', input),
      command: COMMANDS.CAMEL_CASE,
    },
    {
      id: 'case.pascal',
      kind: 'case',
      label: translatable('PascalCase'),
      icon: 'symbol-class',
      apply: (input) => convertCase('pascal', input),
      command: COMMANDS.PASCAL_CASE,
    },
    {
      id: 'case.snake',
      kind: 'case',
      label: translatable('snake_case'),
      icon: 'symbol-variable',
      apply: (input) => convertCase('snake', input),
      command: COMMANDS.SNAKE_CASE,
    },
    {
      id: 'case.kebab',
      kind: 'case',
      label: translatable('kebab-case'),
      icon: 'dash',
      apply: (input) => convertCase('kebab', input),
      command: COMMANDS.KEBAB_CASE,
    },
    {
      id: 'case.constant',
      kind: 'case',
      label: translatable('CONSTANT_CASE'),
      icon: 'symbol-constant',
      apply: (input) => convertCase('constant', input),
      command: COMMANDS.CONSTANT_CASE,
    },
    {
      id: 'case.title',
      kind: 'case',
      label: translatable('Title Case'),
      icon: 'symbol-text',
      apply: (input) => convertCase('title', input),
      command: COMMANDS.TITLE_CASE,
    },

    {
      id: 'codec.base64Encode',
      kind: 'codec',
      label: translatable('Base64 Encode'),
      icon: 'lock',
      apply: (input) => applyCodec('base64Encode', input),
      command: COMMANDS.BASE64_ENCODE,
    },
    {
      id: 'codec.base64Decode',
      kind: 'codec',
      label: translatable('Base64 Decode'),
      icon: 'unlock',
      apply: (input) => applyCodec('base64Decode', input),
      command: COMMANDS.BASE64_DECODE,
    },
    {
      id: 'codec.base64UrlEncode',
      kind: 'codec',
      label: translatable('Base64 Encode (URL-safe)'),
      icon: 'lock-small',
      apply: (input) => applyCodec('base64UrlEncode', input),
    },
    {
      id: 'codec.urlEncode',
      kind: 'codec',
      label: translatable('URL Encode'),
      icon: 'link',
      apply: (input) => applyCodec('urlEncode', input),
      command: COMMANDS.URL_ENCODE,
    },
    {
      id: 'codec.urlDecode',
      kind: 'codec',
      label: translatable('URL Decode'),
      icon: 'link-external',
      apply: (input) => applyCodec('urlDecode', input),
      command: COMMANDS.URL_DECODE,
    },
    {
      id: 'codec.htmlEscape',
      kind: 'codec',
      label: translatable('HTML Escape'),
      icon: 'code',
      apply: (input) => applyCodec('htmlEscape', input),
    },
    {
      id: 'codec.htmlUnescape',
      kind: 'codec',
      label: translatable('HTML Unescape'),
      icon: 'code',
      apply: (input) => applyCodec('htmlUnescape', input),
    },
    {
      id: 'codec.hexEncode',
      kind: 'codec',
      label: translatable('Hex Encode'),
      icon: 'symbol-numeric',
      apply: (input) => applyCodec('hexEncode', input),
    },
    {
      id: 'codec.hexDecode',
      kind: 'codec',
      label: translatable('Hex Decode'),
      icon: 'symbol-numeric',
      apply: (input) => applyCodec('hexDecode', input),
    },
    {
      id: 'codec.jsonEscape',
      kind: 'codec',
      label: translatable('JSON String Escape'),
      icon: 'quote',
      apply: (input) => applyCodec('jsonEscape', input),
    },
    {
      id: 'codec.jsonUnescape',
      kind: 'codec',
      label: translatable('JSON String Unescape'),
      icon: 'quote',
      apply: (input) => applyCodec('jsonUnescape', input),
    },

    {
      id: 'lines.sortAscending',
      kind: 'lines',
      label: translatable('Sort Lines (A→Z)'),
      icon: 'sort-precedence',
      apply: (input) => applyLineOperation('sortAscending', input, deps.locale()),
      command: COMMANDS.SORT_LINES,
    },
    {
      id: 'lines.sortDescending',
      kind: 'lines',
      label: translatable('Sort Lines (Z→A)'),
      icon: 'sort-precedence',
      apply: (input) => applyLineOperation('sortDescending', input, deps.locale()),
    },
    {
      id: 'lines.sortNumeric',
      kind: 'lines',
      label: translatable('Sort Lines (Numeric)'),
      icon: 'sort-precedence',
      apply: (input) => applyLineOperation('sortNumeric', input, deps.locale()),
    },
    {
      id: 'lines.dedupe',
      kind: 'lines',
      label: translatable('Remove Duplicate Lines'),
      icon: 'filter',
      apply: (input) => applyLineOperation('dedupe', input),
      command: COMMANDS.DEDUPE_LINES,
    },
    {
      id: 'lines.reverse',
      kind: 'lines',
      label: translatable('Reverse Line Order'),
      icon: 'fold-up',
      apply: (input) => applyLineOperation('reverse', input),
    },
    {
      id: 'lines.trimLineEnds',
      kind: 'lines',
      label: translatable('Trim Trailing Whitespace'),
      icon: 'whitespace',
      apply: (input) => applyLineOperation('trimLineEnds', input),
    },
    {
      id: 'lines.removeBlankLines',
      kind: 'lines',
      label: translatable('Remove Blank Lines'),
      icon: 'clear-all',
      apply: (input) => applyLineOperation('removeBlankLines', input),
    },

    {
      id: 'json.format',
      kind: 'json',
      label: translatable('Format JSON'),
      icon: 'list-tree',
      apply: (input) => formatJson(input, deps.jsonIndent()),
      command: COMMANDS.JSON_FORMAT,
    },
    {
      id: 'json.minify',
      kind: 'json',
      label: translatable('Minify JSON'),
      icon: 'fold',
      apply: (input) => minifyJson(input),
      command: COMMANDS.JSON_MINIFY,
    },
    {
      id: 'json.sortKeys',
      kind: 'json',
      label: translatable('Sort JSON Keys'),
      icon: 'sort-precedence',
      apply: (input) => sortJsonKeys(input, deps.jsonIndent()),
      command: COMMANDS.JSON_SORT_KEYS,
    },
  ];

  const byId = new Map(all.map((transform) => [transform.id, transform]));

  return {
    all,
    get: (id) => byId.get(id),
    has: (id) => byId.has(id),
  };
}
