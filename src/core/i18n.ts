/**
 * Marking strings for translation.
 *
 * `vscode.l10n.t(someVariable)` still resolves at runtime, but neither the
 * string extractor nor a reader can tell which strings will reach it. Tables of
 * labels — transform names, tool categories — are exactly that case: they are
 * declared in one place and translated in another.
 *
 * {@link translatable} marks the declaration. It does nothing at runtime; its
 * job is to be a literal call site that `scripts/l10n.mjs` can find, so a label
 * added to a table cannot silently end up untranslated. Same idea as gettext's
 * `N_()`.
 */

/**
 * Marks `message` as a string that will be passed through `l10n.t` later.
 *
 * @param message - The English source string
 * @returns `message`, unchanged
 */
export function translatable(message: string): string {
  return message;
}
