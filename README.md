# Quick Utils

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/kkdev92/quick-utils/actions/workflows/ci.yml/badge.svg)](https://github.com/kkdev92/quick-utils/actions/workflows/ci.yml)
[![VS Code Marketplace](https://vsmarketplacebadges.dev/version-short/kkdev92.quick-utils.svg)](https://marketplace.visualstudio.com/items?itemName=kkdev92.quick-utils)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg)](https://www.typescriptlang.org/)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/14050/badge)](https://www.bestpractices.dev/projects/14050)

Change case, encode, hash, reformat JSON, generate values and test regular
expressions — on the selection you already have, without leaving the editor and
without anything reaching the network.
*The small conversions you'd otherwise paste into a website.*

> **Status:** Active (best-effort maintenance)

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Why Quick Utils](#why-quick-utils)
- [Usage](#usage)
- [Known Limitations](#known-limitations)
- [Configuration](#configuration)
- [How It Works](#how-it-works)
- [Security and Privacy](#security-and-privacy)
- [Platform Requirements](#platform-requirements)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Support & Maintenance Policy](#support--maintenance-policy)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Features

- **29 Transforms, One Prompt**: `Ctrl+Alt+T` opens a grouped list — case styles, encoders, line operations, JSON. `Ctrl+Alt+Shift+T` repeats the last one
- **Multi-Cursor Aware**: Every transform applies to all selections at once, as a single undo. A multi-cursor "insert UUID" gives each cursor a different UUID
- **Pipelines**: Tick several transforms and run them in order — trim, dedupe, sort — as one undo step
- **Scratchpad**: A sidebar panel for converting text you are *not* editing, without pasting it into a file first
- **Nothing Half-Done**: A transform that rejects its input — decoding prose as Base64, reformatting broken JSON — says so with the document untouched, never partway through
- **Digests and HMAC**: SHA-256/384/512, SHA-1 and MD5, plus HMAC against a secret held in the OS keychain rather than in your settings — read as text, hex or Base64, because a 64-character hex secret is a 32-byte key
- **Regex Tester That Cannot Hang**: Patterns run in a worker thread with a time budget, so a catastrophically backtracking pattern is abandoned instead of freezing the editor
- **Selection Statistics**: Characters, graphemes, words, lines and UTF-8 bytes — word counts come from Unicode segmentation, so they are right for Japanese and Chinese too
- **Local by Design**: No network requests, no telemetry, no bundled service client
- **Localised**: English and Japanese, for both the UI and the command palette

---

## Installation

### Install from VS Code Marketplace (recommended)

- Open the Extensions view (`Ctrl+Shift+X`)
- Search for **Quick Utils**
- Click **Install**

You can also open the Marketplace page directly:

- <https://marketplace.visualstudio.com/items?itemName=kkdev92.quick-utils>

### Build from Source (for contributors)

> If you just want to use Quick Utils, installing from the Marketplace is the easiest option.

```bash
git clone https://github.com/kkdev92/quick-utils.git
cd quick-utils
npm install
npm run install-local
```

---

## Quick Start

1. Select some text
2. Press `Ctrl+Alt+T` (`Cmd+Alt+T` on macOS)
3. Pick a transform — start typing to filter
4. Press `Ctrl+Alt+Shift+T` to apply the same one again somewhere else

With nothing selected, case and encoding transforms act on the word under the
cursor, and line and JSON transforms act on the whole document. Everything is
also in the Command Palette under **Quick Utils**, and in the sidebar's Tools
view — where the checkbox next to a tool pins it to a per-workspace Favorites
group.

See [sample.md](sample.md) for text to try each transform against.

---

## Why Quick Utils

Base64, URL encoding, case conversion and JSON formatting are things most
people end up doing on a website: paste in, click, paste back. That is fine
until the text is a customer identifier, a signed token, or a fragment of a
config file that is not supposed to leave the building.

Quick Utils does those conversions in the editor. It has no network client of
any kind — there is nothing to configure, nothing to trust, and nothing to
review before pasting a production value into it.

Two consequences shape the rest of the design:

- **Everything is local, so everything must be correct locally.** Decoders
  reject malformed input instead of returning something plausible, word counts
  use Unicode segmentation rather than splitting on spaces, and line operations
  keep the file's own line endings.
- **Local also means it runs on your editor's thread.** The one operation that
  can genuinely run forever — a regular expression — is the one operation that
  does not (see [How It Works](#how-it-works)).

---

## Usage

### Transforms

| Group | Operations |
| --- | --- |
| **Change Case** | `UPPER CASE`, `lower case`, `camelCase`, `PascalCase`, `snake_case`, `kebab-case`, `CONSTANT_CASE`, `Title Case` |
| **Encode / Decode** | Base64 (standard and URL-safe), URL, HTML entities, hexadecimal, JSON string escaping |
| **Lines** | Sort (A→Z, Z→A, numeric), remove duplicates, reverse, trim trailing whitespace, remove blank lines |
| **JSON** | Format, minify, sort keys recursively |

The eight case styles and the common encoders also have commands of their own,
so they can be bound to keys. **Quick Utils: Transform Clipboard…** applies any
transform to the clipboard instead of the document, and **Run Transform
Pipeline…** runs several in sequence — ticked in one prompt, applied top to
bottom, undone in one step.

### Generators

| Command | Notes |
| --- | --- |
| **Insert UUID (v4)** | Random. One per cursor |
| **Insert UUID (v7, time-ordered)** | Timestamp-prefixed, so ids sort by creation order — the property that keeps database inserts clustered at the end of an index |
| **Insert Password…** | Length and character classes; guarantees one character from each class you enable, and is never recorded in history |
| **Insert Lorem Ipsum…** | 1–10 paragraphs |
| **Insert Date / Time…** | Your configured patterns, a pattern typed on the spot, or your editor's locale formatting |
| **Convert Unix Timestamp…** | Reads seconds or milliseconds, shows the local and ISO 8601 forms, and can replace the selection |

### Hashing

**Hash Selection…** replaces each selection with its digest; with nothing
selected, it copies the digest of the whole document instead. **HMAC
Selection…** does the same with a keyed digest, using a secret you store once
via **Manage Secrets…** — which keeps it in the OS keychain, not in
`settings.json`.

MD5 and SHA-1 are offered because checksums in the wild still use them. Picking
one asks for confirmation the first time, with a "don't ask again" option.

### Replace by Pattern

Prompts for a regular expression, flags and a replacement (`$1`, `$<name>` and
`$&` are expanded), shows what the first few replacements will look like, and
applies the whole set as one undo step. With text selected, only matches inside
the selection are replaced.

### Extract Matches

**Extract Matches from Selection…** replaces the selection with the list of
matches found inside it, one per line. When the pattern declares exactly one
capture group, that group is extracted instead of the whole match —
`href="([^"]+)"` is asked about the URL, not the attribute around it.

### Regex Tester

**Open Regex Tester** opens a panel beside the editor: type a pattern, see
matches highlighted in the subject text with their capture groups listed, and
click a match to select it in the editor. The subject can be typed in, taken
from the editor, loaded from a file, or gathered from a glob — file and glob
subjects are re-read when anything they cover changes on disk, which is what
makes them useful against logs that are still being written.

### Sidebar

The **Scratchpad** view converts text without touching any document: paste,
pick a transform, then copy the result, insert it at the cursor, or feed it
back in to chain another transform.

The **Tools** view lists everything by category; tick a checkbox to add a tool
to **Favorites**, and drag favourites to reorder them. The **History** view
records what you ran, with the produced value where it is small enough to be
worth keeping — hover for it, or use the row's buttons to copy it or apply the
same operation again.

---

## Known Limitations

- **Case conversion is not locale-aware.** `toUpperCase` follows the default
  Unicode mappings, so Turkish dotless `ı` and a few other locale-specific
  rules are not applied
- **Date patterns substitute every token letter.** `Date: YYYY` turns the `D`
  and `a` of "Date" into a day number and a meridiem — wrap literal text in
  square brackets: `[Date:] YYYY`
- **The regex tester collects at most 500 matches** per run, and reports when it
  stopped early
- **Word counts depend on the display language.** Segmentation for Chinese,
  Japanese and Thai is dictionary-based, so the same text can count differently
  under a different VS Code display language
- **A pipeline runs in list order**, not in the order you ticked the boxes —
  the API reports the former and not the latter, and the prompt says so
- **No file-level batch operations.** Everything acts on the active editor;
  there is no "run this across the workspace"

---

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `quickUtils.logLevel` | `info` | Log level for the *Quick Utils* output channel |
| `quickUtils.datePatterns` | 8 patterns | Patterns offered by **Insert Date / Time** |
| `quickUtils.jsonIndent` | `editor` | JSON indentation. `editor` follows `editor.tabSize` |
| `quickUtils.historySize` | `100` | Operations kept in History. `0` records nothing |
| `quickUtils.historyPageSize` | `50` | Rows shown before a "Load more…" entry |
| `quickUtils.hashAlgorithm` | `sha256` | Algorithm preselected in the digest picker |
| `quickUtils.hmacKeyEncoding` | `utf8` | How a stored signing secret is read into key bytes |
| `quickUtils.passwordLength` | `20` | Length proposed by **Insert Password** |
| `quickUtils.regexTimeoutMs` | `2000` | How long a pattern may run before it is abandoned |
| `quickUtils.showStatusBar` | `true` | Show selection statistics in the status bar |

Every setting is validated on read: a hand-edited or stale value falls back to
the default and is reported in the output channel rather than reaching the
operation.

---

## How It Works

Most of this extension is unremarkable — pure functions over the selected text,
applied through a single atomic editor edit. Two parts are worth explaining.

**Regular expressions run in a worker thread.** A pattern like `/(a+)+$/`
against forty `a`s and a `b` backtracks for longer than anyone will wait, and
there is no way to interrupt `RegExp.exec` from the thread running it — no
timeout on the caller helps, because the event loop never gets control back.
So patterns are sent to a `worker_threads` worker and raced against
`quickUtils.regexTimeoutMs`. On expiry the worker is terminated (which V8
honours even inside a tight loop) and a fresh one serves the next request. The
editor stays responsive, and the tester reports that the pattern was abandoned.
`scripts/verify-vsix.mjs` runs exactly that scenario against the packaged
worker on every build.

**Outputs are computed before anything is edited.** Each transform runs against
every selection first, and the edit is only applied once all of them have
succeeded. Transforming inside the edit callback would leave the first
selections changed and the rest not, which is a worse outcome than a clear
error message.

---

## Security and Privacy

- **No network I/O**: The extension contains no HTTP client, and neither bundle
  requires Node's `http`, `https`, `net`, `tls` or `dns` modules. CI checks the
  packaged bundles for exactly that
- **No telemetry**: No usage data is collected
- **Secrets in the keychain**: HMAC keys go to `SecretStorage` — the OS keychain
  — never to `settings.json` or global state, and never to Settings Sync. The
  state report lists secret *names* only
- **History stays on the machine**: The operation log is not synced, because it
  can contain fragments of whatever you were editing
- **Passwords are not recorded**: A generated password is inserted and nothing
  else
- **The webview cannot reach the workspace**: The Regex Tester's page script has
  no file system access and does not evaluate the pattern; it sends the pattern
  to the extension host, which validates it against a schema before running it
  in the worker
- **Untrusted and virtual workspaces supported**: No workspace file is read
  unless you pick one, and no process is spawned other than the extension's own
  regex worker

MD5 and SHA-1 are provided for compatibility with existing checksums and are not
collision resistant; the UI says so at the point of choosing. For the full
threat model and for vulnerability reporting, see [SECURITY.md](SECURITY.md).

---

## Platform Requirements

- VS Code 1.125 or later
- Windows, macOS or Linux, on x64 or ARM64

CI runs the test suite on Windows, macOS and Linux (x64 on Windows and Linux,
ARM64 on macOS). The extension is plain JavaScript, so other combinations are
expected to work; please open an issue if one does not.

> The 1.125 floor comes from `@kkdev92/vscode-ext-kit`, whose `engines.vscode` is
> `^1.125.0` — the newest `@types/vscode` there is, and so the newest API it can
> name. Quick Utils 0.1.x works on VS Code 1.96 and up; installations older than
> 1.125 keep that version and simply stop receiving updates.

---

## Troubleshooting

- **"Select some text first"** with something clearly selected: the command ran
  against a different editor than you expected — click into the editor first, so
  it is the active one
- **A transform reports invalid input**: that is the decoder refusing to guess.
  Base64 and hex decoding reject text outside their alphabet, and bytes that do
  not form valid UTF-8, rather than producing replacement characters
- **The regex tester says the pattern was abandoned**: the pattern is
  backtracking. Anchor it, or make a quantifier less greedy; raising
  `quickUtils.regexTimeoutMs` only makes the wait longer
- **A date pattern produced nonsense**: literal letters in a pattern are
  substituted as tokens. Wrap them in square brackets
- **A signature never matches**: check `quickUtils.hmacKeyEncoding`. A secret
  issued as hex or Base64 read as text is a different key, and nothing about
  the failure says so
- **Something looks wrong and you want to report it**: run **Quick Utils:
  Report State**, which opens a Markdown summary of your settings, their
  sources, and what the extension has stored. Attach it to the issue.
  **Collect Diagnostics to Output** writes the same report to a dedicated
  output channel and copies it to the clipboard

---

## Contributing

Contributions are welcome — thank you for helping make Quick Utils better 🙌
Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

If you're planning a larger change, opening an issue first is appreciated (it
helps align direction and avoids duplicate work). Note that anything requiring a
network request is out of scope by design.

---

## Support & Maintenance Policy

Quick Utils is a personal hobby project maintained in spare time.
The project is active, but support is best-effort: I'll do my best to review
issues and PRs, and releases may be a bit slow sometimes — thank you for your
patience.

Helpful things when reporting bugs:

- The output of **Quick Utils: Report State**
- The smallest input that reproduces the issue
- Output from *Output → Quick Utils* at `logLevel: debug`

Security-related reports should follow [SECURITY.md](SECURITY.md).
Really appreciate you using Quick Utils 💛

---

## License

Quick Utils is licensed under the MIT License — see [LICENSE](LICENSE).

Copyright and licence notices for the third-party code shipped inside the VSIX
are collected in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## Acknowledgments

- Extension framework by [@kkdev92/vscode-ext-kit](https://github.com/kkdev92/vscode-ext-kit).
  Quick Utils doubles as its integration test bed — the widest surface of any
  consumer, and where most of its bugs were found
- Word, grapheme and collation behaviour comes from ICU via `Intl.Segmenter`,
  `Intl.Collator` and friends, which ship with Node
