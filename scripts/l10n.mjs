/**
 * Localisation bundle maintenance.
 *
 * Extracts every `l10n.t('…')` string from `src/` and compares it with
 * `l10n/bundle.l10n.json`. A string missing from the bundle still renders (VS
 * Code falls back to the source text), which is exactly why it needs checking:
 * the failure is invisible in English and total in every other language.
 *
 * Usage:
 *   node scripts/l10n.mjs            # check, exit 1 on a mismatch
 *   node scripts/l10n.mjs --write    # rewrite bundle.l10n.json from the source
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const bundlePath = join(projectRoot, 'l10n/bundle.l10n.json');
const japanesePath = join(projectRoot, 'l10n/bundle.l10n.ja.json');

/**
 * `l10n.t('…')` and `translatable('…')`, capturing the message literal.
 *
 * `translatable` marks strings declared in a table and translated elsewhere
 * (see `src/core/i18n.ts`) — without it, a transform label added to the registry
 * would never reach the bundle.
 */
const CALL = /(?:l10n\.t|translatable)\(\s*(['"])((?:\\.|(?!\1).)*)\1/gs;

/** The object form, which this extractor does not read — flagged rather than skipped. */
const OBJECT_CALL = /l10n\.t\(\s*\{/g;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, files);
    } else if (entry.name.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}

/** Turns a source literal back into the string the runtime sees. */
function unescape(literal) {
  return literal.replace(/\\(['"\\nrt])/g, (_match, char) => {
    switch (char) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      default:
        return char;
    }
  });
}

const messages = new Set();
const objectForms = [];

for (const file of walk(join(projectRoot, 'src'))) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(CALL)) {
    messages.add(unescape(match[2]));
  }
  if (OBJECT_CALL.test(source)) {
    objectForms.push(file.slice(projectRoot.length + 1));
  }
  OBJECT_CALL.lastIndex = 0;
}

if (objectForms.length > 0) {
  console.error(
    `❌ l10n.t({ message: … }) is used in ${objectForms.join(', ')}, which this script cannot read.\n` +
      '   Use the string form, or extend scripts/l10n.mjs.'
  );
  process.exit(1);
}

const sorted = [...messages].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

if (process.argv.includes('--write')) {
  const bundle = Object.fromEntries(sorted.map((message) => [message, message]));
  writeFileSync(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${sorted.length} messages to l10n/bundle.l10n.json`);
  process.exit(0);
}

const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
const japanese = JSON.parse(readFileSync(japanesePath, 'utf8'));

let failed = false;

const missing = sorted.filter((message) => !(message in bundle));
if (missing.length > 0) {
  failed = true;
  console.error(`❌ ${missing.length} source message(s) missing from bundle.l10n.json:`);
  for (const message of missing) {
    console.error(`   ${JSON.stringify(message)}`);
  }
}

const stale = Object.keys(bundle).filter((message) => !messages.has(message));
if (stale.length > 0) {
  failed = true;
  console.error(`❌ ${stale.length} message(s) in bundle.l10n.json no longer appear in src/:`);
  for (const message of stale) {
    console.error(`   ${JSON.stringify(message)}`);
  }
}

const untranslated = Object.keys(bundle).filter((message) => !(message in japanese));
if (untranslated.length > 0) {
  failed = true;
  console.error(`❌ ${untranslated.length} message(s) missing from bundle.l10n.ja.json:`);
  for (const message of untranslated) {
    console.error(`   ${JSON.stringify(message)}`);
  }
}

if (failed) {
  console.error('\nRun `node scripts/l10n.mjs --write` to refresh the English bundle.');
  process.exitCode = 1;
} else {
  console.log(`✓ ${sorted.length} messages, all present and translated`);
}
