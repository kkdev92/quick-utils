# Security Policy

## Supported Versions

| Version         | Supported          |
| --------------- | ------------------ |
| Latest release  | :white_check_mark: |
| Older releases  | :x:                |

Fixes ship in a new release rather than as patches to earlier versions.

## Reporting a Vulnerability

1. **Do NOT** create a public GitHub issue.
2. Open a private report:
   <https://github.com/kkdev92/quick-utils/security/advisories/new>

   That is the **"Report a vulnerability"** button in this repository's Security
   tab; the link goes straight to it. Private reporting is enabled, so the
   advisory stays between us until there is a fix to describe.

Reports are looked at on a best-effort basis; please allow a reasonable disclosure window.

## Security Model

Quick Utils exists so that converting text does not require sending it anywhere.
Two properties follow from that, and the measures below implement them: **nothing
leaves the machine**, and **secrets are stored where the operating system keeps
secrets**.

### Non-goals

State the limits up front, so the guarantees below are read for what they are:

- The regex worker is an isolation boundary for a runaway computation, **not a
  process- or OS-level security sandbox**. Code running in it has the same OS
  privileges as the extension host.
- This is not a defence against a malicious VS Code extension, a compromised
  extension host, or a hostile machine. Another extension in the same host can
  read anything this one can.
- The digests offered are not a substitute for a signing library. In particular,
  HMAC comparison is not done here at all — the extension produces a value for
  you to compare, and a naive string comparison of two digests is not
  constant-time.

### No network I/O

- The extension contains no HTTP client, no SDK, and no service configuration.
- Neither bundle requires Node's `http`, `https`, `net`, `tls`, `dns`, `http2` or
  `dgram` modules. `scripts/verify-vsix.mjs` greps the packaged bundles for
  exactly those requires and fails the build if one appears, and CI runs it on
  every package.
- There is no telemetry of any kind.

### Secrets

- HMAC keys are stored through `vscode.SecretStorage`, which is backed by the OS
  keychain (Keychain on macOS, Credential Vault on Windows, libsecret on Linux).
- They are never written to `settings.json`, never to `globalState`, and never
  registered for Settings Sync.
- **Quick Utils: Report State** lists the *names* of stored secrets and their
  count. It does not read their values.
- A generated password is inserted into the document and nowhere else — in
  particular it is not recorded in the operation history, which persists across
  sessions.

### What the operation history holds

The History view records which operation ran, when, and against which file's
basename. It records the produced value only when that value is at most 256
characters — a generated UUID or a digest, not a reformatted document. It is
stored in `globalState` and deliberately **not** opted into Settings Sync,
because it can contain fragments of whatever was being edited. **Quick Utils:
Clear History** removes it.

### Runaway computation is contained, not prevented

Evaluating a user-supplied regular expression is the one operation here that can
run unboundedly. `RegExp.exec` cannot be interrupted from the thread executing
it, so:

- Patterns are evaluated in a `worker_threads` worker, never on the extension
  host.
- Each request is raced against `quickUtils.regexTimeoutMs` (default 2 s).
- On expiry the worker is terminated — V8 honours `terminate()` even inside a
  tight backtracking loop — and a fresh worker serves the next request.
- Requests are serialised, so one wedged pattern cannot hide behind another.

The consequence worth being explicit about: a hostile pattern can still burn one
worker thread's worth of CPU for up to the timeout, repeatedly. It cannot block
the editor.

### The Regex Tester webview

- The webview's page script does not evaluate the pattern. It sends pattern,
  flags and subject to the extension host over a typed RPC channel; the host
  validates the payload against a schema before passing it to the worker.
- The webview has `enableScripts: true` and a generated Content Security Policy
  with a per-load nonce; it has no file system access, and `retainContextWhenHidden`
  is off.
- Subject text is only read from a file the user explicitly picks through the
  system open dialog. That file is then watched so the subject stays current;
  nothing else on disk is touched.
- Matches are rendered into the DOM as text nodes and `<mark>` elements, not by
  assembling an HTML string, so subject text cannot become markup.

### Digest algorithms

MD5 and SHA-1 are offered because checksums in the wild still use them (package
registries, legacy ETags, Gravatar). Neither is collision resistant, and neither
should be used to authenticate anything. Choosing one shows a warning with a
"don't ask again" option, and the picker labels them as checksum-only. SHA-256 is
the default.

HMAC is a different construction and remains sound over SHA-1, but SHA-256 is
still the sensible choice. Keys are interpreted as UTF-8; a key that is really
hex or Base64 must be decoded before use, or the computed value will not match
what the other side produced.

### Untrusted and virtual workspaces

The extension declares support for both. It reads no workspace file unless the
user picks one, spawns no process other than its own regex worker, and executes
nothing from the workspace. The only inputs it processes are the active
selection, the clipboard when you ask for it, and text you type into the tester.

### Supply chain notes

- The only runtime dependency is
  [`@kkdev92/vscode-ext-kit`](https://github.com/kkdev92/vscode-ext-kit), which
  itself has zero runtime dependencies. It is bundled into
  `dist/extension.js`; `package-lock.json` records the exact version each build
  used, and the build bakes that resolved version into the state report.
- Copyright and licence notices for third-party code shipped in the VSIX are in
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), with full texts under
  `third-party/`.
- `scripts/verify-vsix.mjs` also asserts that no source, test, script,
  `node_modules`, source map or `.env` file reaches the package.

## Known Limitations

- Digest comparison is left to the caller, and is not constant-time if done by
  eye or by `===`.
- A worker thread contains a runaway pattern but does not limit its memory; a
  pattern that allocates heavily inside the timeout window can still make the
  extension host process grow.
- Clearing history removes the stored entry, but VS Code's `globalState` backing
  file is not securely erased.
