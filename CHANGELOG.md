# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Breaking: VS Code 1.134 or later is now required**, up from 1.125, in step
  with `@types/vscode` moving to `~1.134.0`. The two have to move together —
  `vsce` refuses to package an extension whose `@types/vscode` is newer than its
  `engines.vscode`, which is what the grouped dependency update ran into:
  `@types/vscode ~1.134.0 greater than engines.vscode ^1.125.0`. The rule is
  right, because types above the floor let code compile against an API the
  declared minimum does not have.

  DefinitelyTyped had been stuck at 1.125.0 for months against a stable line
  already past 1.131; it has now caught up to 1.134.0, one release behind the
  current 1.135.

- Dev dependencies: `vitest` and `@vitest/coverage-v8` 4.1.10 → 4.1.11.

- `CONTRIBUTING.md` said Node.js ≥ 22.12 while `engines.node` and CI both
  require 24, and cited the floor of `@kkdev92/vscode-ext-kit` 2.0 when the
  dependency has been `^3.0.0` for some time. Both corrected.

### Fixed

- **`quickUtils.logLevel` now does something.** It was declared, described in
  both language files, documented and offered in the settings editor — and no
  code read it, so setting it changed nothing. It is a *floor*: VS Code owns a
  `LogOutputChannel`'s level, per channel, in the Output panel, so this can make
  the log quieter but cannot turn on output VS Code is already dropping. Use
  **Developer: Set Log Level** for that. The level is read per entry, so a
  change applies immediately rather than after a reload.

## [0.3.0] - 2026-08-08

Three new features, and a rebuild on `@kkdev92/vscode-ext-kit` 3.x underneath
them. Every existing command works the way it did — the rewrite is in how the
extension starts, not in what it does.

### Added

- **Workspace snippets.** A `.quick-utils.json` at the workspace root holds
  named snippets — the licence header, the `docker run` line, the bug report
  template — and **Insert Snippet** puts one at the cursor. The file travels
  with a clone, so it belongs to the project rather than to whoever typed it,
  and editing it takes effect without a reload. **Reload Snippets** is there for
  when you want to be told what it made of the file, including which entries it
  could not read. A malformed file keeps the last version that parsed, so a
  stray comma costs you nothing.
- **Decode on hover.** Base64, hex and unix timestamps are shown by pointing at
  them. The same three readings the commands give, without replacing anything —
  most of the time you only want to see the value. Only tokens shaped like one
  of the three get a hover; a long identifier does not.
- **Watch files.** Point it at a glob and it reports what changes underneath —
  created, changed, deleted — batched so that a build writing forty files is one
  report rather than forty.

### Changed

- **Four settings are now declared as integers** rather than numbers:
  `historySize`, `historyPageSize`, `passwordLength` and `regexTimeoutMs`. They
  only ever accepted whole values; settings-editor validation now says so before
  you save rather than after.
- **The untrusted-workspace description is more specific.** It always said the
  extension reads no workspace file unless you pick one, and now it names the
  snippet file as the thing an untrusted window is not read for at all.

### Fixed

- **A decoded hover cannot break out of its code block.** A value that decoded
  to a closing fence let the rest of it render as markdown — links included.
  The block is now fenced so that its contents cannot close it.
- **The snippet file is not read in untrusted workspaces.** It was read at
  startup like any other, which is not what this extension promises about a
  window you have declined to trust.

## [0.2.0] - 2026-08-01

A rewrite. Every command was reimplemented on `@kkdev92/vscode-ext-kit` 2.1,
which is not backwards compatible with the 0.x line this extension previously
used, and the feature set was reworked around a single grouped transform picker.

### Changed

- **The minimum supported VS Code version is now 1.125** (from 1.96).
  `@kkdev92/vscode-ext-kit` 2.0 raised its own `engines.vscode` to `^1.125.0` so
  that the APIs added since 1.96 are usable without feature detection, and that
  requirement cascades here. Installations older than 1.125 keep working on
  0.1.0; they simply stop receiving updates.
- **One prompt instead of nineteen commands.** `Quick Utils: Transform
  Selection…` (`Ctrl+Alt+T`) lists every transform, grouped and filterable, with
  `Ctrl+Alt+Shift+T` to repeat the last one. The eight case styles and the common
  encoders keep commands of their own for key bindings.
- **Transforms no longer half-apply.** Outputs are computed for every selection
  before any edit is made, so a decoder that rejects its input reports the
  problem with the document untouched.
- **Decoders reject malformed input** instead of returning something
  plausible-looking. Base64 and hex decoding check the alphabet, the length, and
  that the resulting bytes are valid UTF-8 — previously, decoding prose as Base64
  "succeeded" and replaced the selection with garbage.
- **Line operations preserve the file's line endings and trailing newline.**
  Sorting a CRLF file no longer rewrites it as LF.
- **Word counts use Unicode segmentation** (`Intl.Segmenter`) rather than
  splitting on whitespace, so Japanese and Chinese text is counted as words
  rather than as one.
- **Settings are validated on read.** A hand-edited or stale value falls back to
  its declared default and is reported in the output channel.
- **The output channel is a native `LogOutputChannel`**, so timestamps, level
  colours, the Output panel's level dropdown and `Developer: Set Log Level` all
  work. `quickUtils.logLevel` now applies *on top of* the panel's own level
  selector.

### Added

- `CONSTANT_CASE` and `Title Case`; HTML entity, hexadecimal and JSON-string
  codecs; URL-safe Base64.
- Line operations: sort ascending / descending / numeric, remove duplicates,
  reverse, trim trailing whitespace, remove blank lines.
- **Sort JSON Keys**, recursively and locale-independently.
- **Insert UUID (v7)** — RFC 9562 time-ordered ids, so they sort by creation
  order.
- **Insert Password…**, with selectable character classes, a guaranteed
  character from each, and an option to exclude look-alike characters. Generated
  passwords are never recorded in history.
- **Convert Unix Timestamp…**, reading seconds or milliseconds.
- **Hash Selection…** (SHA-256/384/512, SHA-1, MD5) and **HMAC Selection…**
  against secrets held in the OS keychain, managed by **Manage Secrets…**.
  Choosing MD5 or SHA-1 warns once, with a "don't ask again" option.
- **Replace by Pattern…** — regex search and replace over the document or the
  selection, with `$1` / `$<name>` / `$&` expansion, a preview of the first few
  replacements, and one undo step for the whole set.
- **A regex tester that cannot hang the editor.** Patterns are evaluated in a
  worker thread with a time budget; a catastrophically backtracking pattern is
  abandoned and the worker replaced. The panel highlights matches, lists capture
  groups, can take its subject from the editor or from a file (re-read when that
  file changes), and reveals a match in the editor when clicked.
- **Both webview page scripts are TypeScript**, typed against the same RPC
  schemas as the extension host and bundled with the kit's `webview-client` —
  so a request one side sends and the other does not answer fails to compile
  instead of timing out at runtime.
- **Selection statistics** in the status bar and a full breakdown via **Inspect
  Selection** — characters, graphemes, words, lines, UTF-8 bytes and the offset
  range.
- **A JSON validity indicator** in the language status area for JSON and JSONC
  files.
- **Favorites in the Tools view** — tick a checkbox to pin a tool, drag to
  reorder. Stored per workspace.
- **History** with paging, hover for the produced value, and per-row actions to
  copy it or apply the same operation again. Capped by `quickUtils.historySize`,
  not synced.
- **Run Transform Pipeline…** — tick several transforms and run them in
  sequence. Each stage is applied against what the previous one left behind, and
  the whole run collapses into one undo step. Validated up front, so a stage that
  rejects its input leaves the document untouched.
- **Extract Matches from Selection…** — replaces the selection with the matches
  found inside it, extracting the capture group when the pattern declares exactly
  one.
- **A Scratchpad view** in the sidebar: convert text without pasting it into a
  document first, then copy it, insert it at the cursor, or feed it back in to
  chain another transform.
- **Transform Clipboard…**, applying any transform to the clipboard instead of
  the document.
- **HMAC key encodings.** `quickUtils.hmacKeyEncoding` decides whether a stored
  secret is read as text, hex or Base64 — a 64-character hex secret is a 32-byte
  key, and reading it as text produces a signature that silently never matches.
  Values are validated against the encoding as they are typed.
- **HMAC with Default Key** and **Set Default Signing Key…**, for the common case
  of one webhook secret used over and over.
- **Manage Secrets…** is now one list with an inline delete button per row and an
  add button in the title bar, reopening after each change.
- **A glob subject for the Regex Tester** — gather every file matching a pattern
  into one subject, re-read as they change.
- **Report State**, opening a Markdown summary of settings, their sources, and
  what the extension has stored — for attaching to bug reports. It lists secret
  names, never values. Numbers and dates in it are formatted in a fixed locale so
  two reports can be compared directly.
- **Collect Diagnostics to Output** and **Log Document Details**, writing to a
  dedicated plain output channel that the Output panel's level selector does not
  filter — so "send me the logs" returns all of them.
- Japanese localisation of every UI string and every manifest string.

### Removed

- **The API key and HTTP client.** `quickUtils.setApiKey` and the request helper
  behind it had no caller, no configured endpoint, and no reason to exist in an
  offline text utility. Any key stored by 0.1.0 under `quickUtils.apiKey` is
  ignored; remove it with **Manage Secrets…** if you want it gone from the
  keychain.
- `quickUtils.autoRetry`, which only configured the removed HTTP client.
- `quickUtils.dateFormat` (single string) in favour of `quickUtils.datePatterns`
  (a list offered by the picker).

### Fixed

- **A cancelled or timed-out regex request no longer produces an unhandled
  promise rejection** when its worker is terminated.
- `&nbsp;` now unescapes to U+00A0 rather than a plain space.
- Base64 decoding accepts unpadded input, which several encoders produce, while
  still rejecting a length that cannot encode a whole byte.
- Date patterns support `[literal]` escaping, so `[Date:] YYYY` no longer turns
  the letters of "Date" into tokens.

### Migration from 0.1.0

- Stored history is migrated: entries whose operation still exists are kept with
  their new ids, and the rest are dropped.
- Keybindings changed. `Ctrl+Shift+T` (which collided with VS Code's *Reopen
  Closed Editor*) is now `Ctrl+Alt+T`.
- Several command ids changed to match their new grouping — for example
  `quickUtils.toUpperCase` is now `quickUtils.upperCase`, and
  `quickUtils.formatJson` is now `quickUtils.jsonFormat`. Custom keybindings
  referencing the old ids need updating.

## [0.1.0] - 2026-04-26

First release.

### Added

- Text transforms (case conversion, Base64, URL encoding), JSON formatting, UUID
  and Lorem Ipsum generation, a date-insertion wizard and a regex tester
  webview.
- Tools and History views in the activity bar.
- Localised UI (English, Japanese).

[Unreleased]: https://github.com/kkdev92/quick-utils/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/kkdev92/quick-utils/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/kkdev92/quick-utils/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kkdev92/quick-utils/releases/tag/v0.1.0
