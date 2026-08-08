/**
 * Decoding whatever is under the pointer.
 *
 * A base64 blob, a hex dump, a unix timestamp — the same three things this
 * extension already has commands for, except that half the time you only want
 * to *see* the value, not replace it. A hover is the right shape for that: no
 * command, no selection, no edit.
 *
 * **This is the managed raw escape hatch, and the reason is worth stating.**
 * The framework has no model for a hover provider, and inventing a
 * general-purpose one in order to register a single provider would be a worse
 * trade than calling `vscode.languages` here. What the escape hatch buys is
 * that the registration is still owned: it goes into the module's registration
 * scope and is released on shutdown by the same path as everything else, and it
 * appears in the plan as a declared raw registration rather than as a stray
 * `import 'vscode'` somewhere in a feature.
 */

import * as vscode from 'vscode';

import { base64Decode, hexDecode } from '../lib/codec';
import { formatDateTime, parseUnixTimestamp } from '../lib/datetime';
import type { LocalizationService, Logger } from '@kkdev92/vscode-ext-kit';

/** Runs of characters worth trying to decode. */
const CANDIDATE = /[A-Za-z0-9+/=_-]{4,}/u;

/** Digit counts that make a number a plausible date rather than an id. */
const EPOCH = /^\d{9,13}$/u;
const HEX = /^(?:0x)?[0-9a-fA-F]{4,}$/u;

/** One decoded reading of the token, or nothing when it does not apply. */
export type Reading = { readonly kind: string; readonly value: string } | undefined;

/**
 * Whether a decoded string is text, rather than bytes that happened to decode.
 *
 * A control character is the giveaway: a sha256 digest is valid hex and means
 * nothing as text, and showing the mojibake would be worse than showing
 * nothing. Tab, newline and carriage return are allowed through — a decoded
 * snippet legitimately contains those, and rejecting them would drop exactly
 * the multi-line payloads this is most useful for.
 *
 * A code-point scan rather than a regex, because a character class of control
 * characters is unreadable however it is written, which is what
 * `no-control-regex` exists to stop.
 */
function readable(text: string): boolean {
  if (text.length === 0) {
    return false;
  }
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    const isWhitespace = code === 0x09 || code === 0x0a || code === 0x0d;
    if (!isWhitespace && (code < 0x20 || code === 0x7f)) {
      return false;
    }
  }
  return true;
}

/**
 * Reads a token as a unix timestamp.
 *
 * Digit count is the only signal available — `1700000000` is a plausible date
 * and a plausible identifier — so the bound is what keeps every long number in
 * the file from sprouting a hover.
 */
function asEpoch(token: string, l10n: LocalizationService): Reading {
  if (!EPOCH.test(token)) {
    return undefined;
  }
  try {
    // Local time, like every other date this extension renders: the hover is
    // read next to a clock, not next to a log timestamp.
    return {
      kind: l10n.t('Unix timestamp'),
      value: formatDateTime('YYYY-MM-DD HH:mm:ss', parseUnixTimestamp(token)),
    };
  } catch {
    return undefined;
  }
}

/** Reads a token as hex bytes, when they spell out text. */
function asHex(token: string, l10n: LocalizationService): Reading {
  const digits = token.startsWith('0x') ? token.slice(2) : token;
  if (!HEX.test(token) || digits.length % 2 !== 0) {
    return undefined;
  }
  try {
    const text = hexDecode(digits);
    return readable(text) ? { kind: l10n.t('Hex'), value: text } : undefined;
  } catch {
    return undefined;
  }
}

/** Reads a token as base64, when it decodes to something printable. */
function asBase64(token: string, l10n: LocalizationService): Reading {
  try {
    const text = base64Decode(token);
    // A token that decodes to itself is almost certainly a plain word that
    // happens to be valid base64 — `test` is not interesting to decode.
    return readable(text) && text !== token ? { kind: l10n.t('Base64'), value: text } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The whole of the decision, so it can be checked without an editor.
 *
 * Order matters: a run of digits is a timestamp before it is hex, because a
 * timestamp is what someone pasting `1700000000` meant.
 */
export function readToken(token: string, l10n: LocalizationService): Reading {
  return asEpoch(token, l10n) ?? asHex(token, l10n) ?? asBase64(token, l10n);
}

/**
 * Registers the hover provider.
 *
 * `{ scheme: '*' }` rather than a language list: what matters is the shape of
 * the text, and a token in a log file is exactly as worth decoding as one in
 * TypeScript.
 */
export function registerDecodeHover(l10n: LocalizationService, logger: Logger): vscode.Disposable {
  return vscode.languages.registerHoverProvider(
    { scheme: '*' },
    {
      provideHover(document, position): vscode.Hover | undefined {
        const range = document.getWordRangeAtPosition(position, CANDIDATE);
        if (range === undefined) {
          return undefined;
        }

        const reading = readToken(document.getText(range), l10n);
        if (reading === undefined) {
          return undefined;
        }

        logger.trace('hover decoded', { kind: reading.kind });
        const content = new vscode.MarkdownString();
        content.appendMarkdown(`**${reading.kind}**\n\n`);
        // A fenced block, not inline markdown: this is arbitrary text out of
        // the user's document, and a MarkdownString renders what it is given.
        content.appendCodeblock(reading.value);
        return new vscode.Hover(content, range);
      },
    }
  );
}
