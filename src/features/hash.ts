/**
 * Digests and HMACs over the selection, plus the secrets backing HMAC.
 *
 * Secrets live in `SecretStorage` — the OS keychain — and never in settings or
 * global state. That is the whole reason this feature can exist: a webhook
 * signing secret is exactly the kind of value that must not end up in a synced
 * settings file or a workspace commit.
 */

import * as vscode from 'vscode';
import {
  confirm,
  createSecretStorage,
  createSecretStore,
  err,
  getAllSelectedText,
  inputText,
  l10n,
  mapResult,
  mapResultErr,
  ok,
  pickOne,
  showError,
  showInfo,
  showStatusMessage,
  toPickButton,
  toPickItem,
  transformAllSelections,
  unwrap,
  type Logger,
  type Result,
  type SecretStorage,
  type SecretStore,
} from '@kkdev92/vscode-ext-kit';

import { CONFIG } from '../core/constants';
import { config } from '../core/config';
import {
  HASH_ALGORITHMS,
  KeyEncodingError,
  decodeKey,
  hashText,
  hmacText,
  isLegacyAlgorithm,
  type HashAlgorithm,
  type KeyEncoding,
} from '../lib/hash';
import { fileField } from './transform';
import type { HistoryStore } from './history';

/**
 * Named secrets are stored under this prefix, so {@link SecretStore.keys} can
 * list them without picking up the default key below.
 */
const SECRET_PREFIX = 'quickUtils.hmac:';

/** The single "just sign it" key, addressed on its own so it can be watched. */
const DEFAULT_SECRET_KEY = 'quickUtils.defaultSecret';

/** Memento key remembering that the user accepted a legacy digest algorithm. */
const LEGACY_ACKNOWLEDGED = 'quickUtils.acknowledgedLegacyHash';

/** Collaborators the hash commands need. */
export interface HashContext {
  logger: Logger;
  history: HistoryStore;
  secrets: SecretStore;
  /** The default signing key, as its own watchable handle. */
  defaultSecret: SecretStorage;
  globalState: vscode.Memento;
}

/** Creates the store used for named HMAC secrets. */
export function createHmacSecretStore(context: vscode.ExtensionContext): SecretStore {
  return createSecretStore(context);
}

/**
 * Creates the handle for the default signing key.
 *
 * A single-key wrapper rather than another lookup through the store, because
 * this one needs `onDidChange`: the key can be set from another window, and the
 * "no default key yet" prompt must stop appearing when it is.
 */
export function createDefaultSecretStorage(context: vscode.ExtensionContext): SecretStorage {
  return createSecretStorage(context, DEFAULT_SECRET_KEY);
}

/**
 * Reads a secret's text into key bytes.
 *
 * Returns a {@link Result} rather than throwing: every caller has something
 * specific to say when the encoding does not match, and none of them wants an
 * exception crossing a UI flow.
 */
function readKey(text: string, encoding: KeyEncoding): Result<Uint8Array, Error> {
  try {
    return ok(decodeKey(text, encoding));
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/** Turns a key-decoding failure into something worth showing a user. */
function explainKeyFailure(error: Error, encoding: KeyEncoding): string {
  return error instanceof KeyEncodingError
    ? l10n.t(
        '{0} Check that quickUtils.hmacKeyEncoding ({1}) matches how the secret was issued.',
        error.message,
        encoding
      )
    : error.message;
}

/** Asks which digest algorithm to use, defaulting to the configured one. */
async function pickAlgorithm(placeHolder: string): Promise<HashAlgorithm | undefined> {
  const configured = config.get(CONFIG.HASH_ALGORITHM);

  const picked = await pickOne(
    HASH_ALGORITHMS.map((algorithm) =>
      toPickItem(algorithm, {
        label: algorithm.toUpperCase(),
        description: [
          algorithm === configured ? l10n.t('configured default') : undefined,
          isLegacyAlgorithm(algorithm)
            ? l10n.t('checksums only — not collision resistant')
            : undefined,
        ]
          .filter((part) => part !== undefined)
          .join(' · '),
        icon: isLegacyAlgorithm(algorithm) ? 'warning' : 'key',
      })
    ),
    { placeHolder }
  );

  return picked?.value;
}

/**
 * Warns before a legacy algorithm is used, once.
 *
 * `remember` persists the acknowledgement, so this is a guard rail rather than
 * a nag: someone who genuinely needs MD5 checksums says so once.
 */
async function confirmLegacyAlgorithm(
  algorithm: HashAlgorithm,
  globalState: vscode.Memento
): Promise<boolean> {
  if (!isLegacyAlgorithm(algorithm)) {
    return true;
  }
  return confirm(
    l10n.t('{0} is not collision resistant. Use it for checksums only.', algorithm.toUpperCase()),
    {
      severity: 'warn',
      detail: l10n.t('Choose SHA-256 or stronger if this value protects anything.'),
      yesText: l10n.t('Use it anyway'),
      remember: { memento: globalState, key: LEGACY_ACKNOWLEDGED },
    }
  );
}

/** Replaces each selection with its digest, or copies the digest if nothing is selected. */
export async function hashSelection(
  context: HashContext,
  editor: vscode.TextEditor
): Promise<void> {
  const algorithm = await pickAlgorithm(l10n.t('Digest algorithm'));
  if (algorithm === undefined) {
    return;
  }
  if (!(await confirmLegacyAlgorithm(algorithm, context.globalState))) {
    return;
  }

  await digestSelections(context, editor, `hash.${algorithm}`, algorithm.toUpperCase(), (input) =>
    hashText(algorithm, input)
  );
}

/** Replaces each selection with its HMAC under a secret chosen for this run. */
export async function hmacSelection(
  context: HashContext,
  editor: vscode.TextEditor
): Promise<void> {
  const algorithm = await pickAlgorithm(l10n.t('HMAC algorithm'));
  if (algorithm === undefined) {
    return;
  }

  const key = await resolveSecret(context);
  if (key === undefined) {
    return;
  }

  await digestSelections(
    context,
    editor,
    `hmac.${algorithm}`,
    `HMAC-${algorithm.toUpperCase()}`,
    (input) => hmacText(algorithm, key, input)
  );
}

/**
 * Signs with the default key and the configured algorithm, asking nothing.
 *
 * The common case is one webhook secret used over and over; making that a
 * three-prompt flow is what pushes people back to a website.
 */
export async function hmacWithDefaultSecret(
  context: HashContext,
  editor: vscode.TextEditor
): Promise<void> {
  const stored = await context.defaultSecret.get();
  if (stored === undefined) {
    const action = await showInfo(l10n.t('No default signing key is set.'), {
      actions: [{ title: l10n.t('Set one now'), value: 'set' as const }],
    });
    if (action === 'set') {
      await setDefaultSecret(context);
    }
    return;
  }

  const algorithm = config.get(CONFIG.HASH_ALGORITHM);
  const encoding = config.get(CONFIG.HMAC_KEY_ENCODING);

  // `unwrap` on purpose: the key was decoded successfully when it was stored,
  // so a failure here means the encoding setting changed underneath it. That is
  // worth a loud error through the command wrapper, not a quiet fallback.
  const key = unwrap(
    mapResultErr(readKey(stored, encoding), (error) => new Error(explainKeyFailure(error, encoding)))
  );

  await digestSelections(
    context,
    editor,
    `hmac.${algorithm}`,
    `HMAC-${algorithm.toUpperCase()}`,
    (input) => hmacText(algorithm, key, input)
  );
}

/**
 * Applies a digest to every selection.
 *
 * With nothing selected there is nothing to replace, so the digest of the whole
 * document goes to the clipboard instead — which is what "checksum this file"
 * means.
 */
async function digestSelections(
  context: HashContext,
  editor: vscode.TextEditor,
  id: string,
  label: string,
  digest: (input: string) => string
): Promise<void> {
  const hasSelection = editor.selections.some((selection) => !selection.isEmpty);

  if (!hasSelection) {
    const value = digest(editor.document.getText());
    const action = await showInfo(`${label}: ${value}`, {
      actions: [{ title: l10n.t('Copy'), value: 'copy' as const }],
    });
    if (action === 'copy') {
      await vscode.env.clipboard.writeText(value);
      showStatusMessage(`$(clippy) ${l10n.t('Copied')}`, 1500);
    }
    await context.history.add({
      id,
      kind: 'hash',
      timestamp: Date.now(),
      output: value,
      ...fileField(editor),
    });
    return;
  }

  const values = getAllSelectedText(editor).map(digest);
  if (!(await transformAllSelections(editor, (original, index) => values[index] ?? original))) {
    await showError(l10n.t('The editor rejected the edit. The file may be read-only.'));
    return;
  }

  showStatusMessage(`$(key) ${label}`, 2000);
  await context.history.add({
    id,
    kind: 'hash',
    timestamp: Date.now(),
    ...(values.length === 1 ? { output: values[0] } : {}),
    ...fileField(editor),
  });
}

/** Lists the names of stored named secrets. */
async function secretNames(secrets: SecretStore): Promise<string[]> {
  const keys = await secrets.keys();
  return keys
    .filter((key) => key.startsWith(SECRET_PREFIX))
    .map((key) => key.slice(SECRET_PREFIX.length))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Sentinel for "I want to type a new secret rather than pick a stored one". */
const ADD_SECRET = ' add';

/** Picks a stored secret and returns its key bytes. */
async function resolveSecret(context: HashContext): Promise<Uint8Array | undefined> {
  const names = await secretNames(context.secrets);
  const encoding = config.get(CONFIG.HMAC_KEY_ENCODING);

  const picked = await pickOne(
    [
      ...names.map((name) => toPickItem(name, { label: name, icon: 'lock' })),
      toPickItem(ADD_SECRET, {
        label: l10n.t('Add a secret…'),
        icon: 'add',
        alwaysShow: true,
      }),
    ],
    { placeHolder: l10n.t('Signing secret'), prompt: l10n.t('Read as {0}', encoding) }
  );
  if (picked === undefined) {
    return undefined;
  }

  if (picked.value === ADD_SECRET) {
    const added = await addSecret(context, names);
    return added?.key;
  }

  const stored = await context.secrets.get(`${SECRET_PREFIX}${picked.value}`);
  if (stored === undefined) {
    // Deleted from the keychain between listing and reading, or by another window.
    await showError(l10n.t('That secret is no longer stored.'));
    return undefined;
  }

  const result = readKey(stored, encoding);
  if (!result.ok) {
    await showError(explainKeyFailure(result.error, encoding));
    return undefined;
  }
  return result.value;
}

/**
 * Prompts for a name and value, validating the value against the configured
 * encoding as it is typed, and stores it.
 */
async function addSecret(
  context: HashContext,
  existing: readonly string[]
): Promise<{ name: string; key: Uint8Array } | undefined> {
  const encoding = config.get(CONFIG.HMAC_KEY_ENCODING);

  const name = await inputText({
    prompt: l10n.t('Name for this secret'),
    placeHolder: l10n.t('e.g. stripe-webhook'),
    validate: (value) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return l10n.t('Enter a name.');
      }
      if (existing.includes(trimmed)) {
        return l10n.t('A secret with that name already exists.');
      }
      return undefined;
    },
  });
  if (name === undefined) {
    return undefined;
  }

  const value = await inputText({
    prompt: l10n.t('Secret value, as {0}', encoding),
    password: true,
    // Losing a half-typed secret because a notification stole focus is worse
    // than the input box lingering.
    ignoreFocusOut: true,
    validate: (input) => {
      if (input.length === 0) {
        return l10n.t('Enter a value.');
      }
      const result = readKey(input, encoding);
      return result.ok ? undefined : explainKeyFailure(result.error, encoding);
    },
  });
  if (value === undefined) {
    return undefined;
  }

  const result = readKey(value, encoding);
  if (!result.ok) {
    await showError(explainKeyFailure(result.error, encoding));
    return undefined;
  }

  await context.secrets.set(`${SECRET_PREFIX}${name.trim()}`, value);
  context.logger.info('Stored an HMAC secret', { name: name.trim() });

  // The byte length is the cheap confirmation that the encoding was right: a
  // 64-character hex secret is 32 bytes, and seeing "64 bytes" means it was
  // read as text.
  const size = unwrap(mapResult(result, (bytes) => bytes.byteLength));
  showStatusMessage(`$(lock) ${l10n.t('Secret stored ({0} bytes)', String(size))}`, 2500);

  return { name: name.trim(), key: result.value };
}

/** Chooses which secret is used by "HMAC with default key". */
export async function setDefaultSecret(context: HashContext): Promise<void> {
  const names = await secretNames(context.secrets);
  if (names.length === 0) {
    const added = await addSecret(context, names);
    if (added === undefined) {
      return;
    }
    const stored = await context.secrets.get(`${SECRET_PREFIX}${added.name}`);
    if (stored !== undefined) {
      await context.defaultSecret.set(stored);
      showStatusMessage(`$(star-full) ${l10n.t('Default signing key set')}`, 2000);
    }
    return;
  }

  const picked = await pickOne(
    names.map((name) => toPickItem(name, { label: name, icon: 'lock' })),
    { placeHolder: l10n.t('Which secret should be the default?') }
  );
  if (picked === undefined) {
    return;
  }

  const stored = await context.secrets.get(`${SECRET_PREFIX}${picked.value}`);
  if (stored === undefined) {
    await showError(l10n.t('That secret is no longer stored.'));
    return;
  }

  await context.defaultSecret.set(stored);
  context.logger.info('Default signing key set', { name: picked.value });
  showStatusMessage(`$(star-full) ${l10n.t('Default signing key set')}`, 2000);
}

/** What the secrets list resolved to. */
type SecretAction =
  | { kind: 'add' }
  | { kind: 'delete'; name: string }
  | { kind: 'replace'; name: string };

/**
 * Add, replace and delete stored secrets, from one list.
 *
 * The list reopens after each action, so managing several secrets is one flow
 * rather than one command per change.
 */
export async function manageSecrets(context: HashContext): Promise<void> {
  for (;;) {
    const action = await showSecretList(context);
    if (action === undefined) {
      return;
    }

    if (action.kind === 'add') {
      await addSecret(context, await secretNames(context.secrets));
      continue;
    }

    if (action.kind === 'replace') {
      await replaceSecret(context, action.name);
      continue;
    }

    const confirmed = await confirm(l10n.t('Delete the secret "{0}"?', action.name), {
      detail: l10n.t('It is removed from the OS keychain and cannot be recovered.'),
      yesText: l10n.t('Delete'),
    });
    if (confirmed) {
      await context.secrets.delete(`${SECRET_PREFIX}${action.name}`);
      context.logger.info('Deleted an HMAC secret', { name: action.name });
      showStatusMessage(`$(trash) ${l10n.t('Secret deleted')}`, 2000);
    }
  }
}

/**
 * Shows the secrets list once and resolves with the chosen action.
 *
 * The shape here is a list with a delete button on each row plus an add button
 * in the title. Since kit 2.1.0, `pickOne` carries that directly —
 * `PickOptions.buttons` with the two trigger handlers — so the raw
 * `createQuickPick` this used to be built on is gone. A button press records
 * the action and hides the picker; `pickOne` then resolves `undefined`, and the
 * recorded action wins over the (absent) selection.
 */
async function showSecretList(context: HashContext): Promise<SecretAction | undefined> {
  const names = await secretNames(context.secrets);

  const deleteButton = toPickButton('trash', { tooltip: l10n.t('Delete this secret') });
  const addButton = toPickButton('add', {
    tooltip: l10n.t('Add a secret…'),
    location: vscode.QuickInputButtonLocation.Title,
  });

  let action: SecretAction | undefined;

  const picked = await pickOne(
    names.map((name) => toPickItem(name, { label: name, icon: 'lock', buttons: [deleteButton] })),
    {
      title: l10n.t('Manage Secrets'),
      placeHolder:
        names.length === 0
          ? l10n.t('No secrets stored yet — use the + button')
          : l10n.t('Select a secret to replace its value'),
      buttons: [addButton],
      onTriggerButton: (button, picker) => {
        if (button === addButton) {
          action = { kind: 'add' };
          picker.hide();
        }
      },
      onTriggerItemButton: (button, item, picker) => {
        if (button === deleteButton) {
          action = { kind: 'delete', name: item.value };
          picker.hide();
        }
      },
    }
  );

  if (action !== undefined) {
    return action;
  }
  return picked === undefined ? undefined : { kind: 'replace', name: picked.value };
}

/** Replaces one secret's value, validating against the configured encoding. */
async function replaceSecret(context: HashContext, name: string): Promise<void> {
  const encoding = config.get(CONFIG.HMAC_KEY_ENCODING);

  const value = await inputText({
    prompt: l10n.t('New value for "{0}", as {1}', name, encoding),
    password: true,
    ignoreFocusOut: true,
    validate: (input) => {
      if (input.length === 0) {
        return l10n.t('Enter a value.');
      }
      const result = readKey(input, encoding);
      return result.ok ? undefined : explainKeyFailure(result.error, encoding);
    },
  });
  if (value === undefined) {
    return;
  }

  await context.secrets.set(`${SECRET_PREFIX}${name}`, value);
  showStatusMessage(`$(lock) ${l10n.t('Secret replaced')}`, 2000);
}
