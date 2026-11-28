# Quick Utils project guide

Start here before taking action in this project. Read the section for your task: [reporting a problem](#reporting-a-problem), [verifying a change](#verifying-a-change), [development instructions](#development-instructions), or [security and private reports](#security-and-private-reports). Consult this guide again if your task changes.

## Reporting a problem

Run **Quick Utils: Report State** from the Command Palette. It includes versions, settings and their sources. It lists stored secret names without their values. Review the output before sharing it. For a text transform, include the smallest non-sensitive selection; for a regex issue, include the pattern, flags and a sample input.

For logs, set `quickUtils.logLevel` to `debug`, select Debug for the Quick Utils Output channel, and reproduce the problem. Share the relevant lines after checking them for sensitive input. Suggestions must work locally without network access.

## Working on the project

See [Working on the kit alongside this extension](#working-on-the-kit-alongside-this-extension) when changing Quick Utils and its extension library together.

## Verifying a change

Use the rows that apply to your change when preparing a merge candidate.

| Change | What to check |
| --- | --- |
| Extension logic | Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:coverage`. Include a regression case for changed behavior. |
| Commands or visible strings | Run `npm run check:l10n`. Check the English and Japanese strings, including the manifest strings when affected. |
| Bundle or dependencies | Run `npm run package` and `npm run verify:vsix`. Update third-party notices and bundled license files when a bundled dependency changes. |
| User-visible behavior | Update the README and changelog where the documented behavior changes. |

See the [shared contribution guidelines](https://github.com/kkdev92/.github/blob/main/CONTRIBUTING.md) for the two pull request options.

## Development instructions

The following development and verification requirements apply when preparing product changes for merge. Reference implementations only need a short description of the idea.

## Getting Started

### Prerequisites

- Node.js ≥ 24 (matches `engines.node` and what CI runs)
- VS Code ≥ 1.138 (the floor `@kkdev92/vscode-ext-kit` requires)
- Nothing else — no Java, no Docker, no service credentials

### Development Setup

```bash
git clone https://github.com/kkdev92/quick-utils
cd quick-utils
npm install
npm run bundle
```

Open the folder in VS Code and press `F5`. An Extension Development Host starts with `sample.md` open. `npm run bundle:watch` rebuilds on save.

## Project Structure

```text
src/
├── lib/             pure logic — case, codecs, hashes, JSON, generators,
│                    date patterns, line operations, regex matching.
│                    No `vscode` import, no kit import: this is the layer
│                    the unit tests hit directly.
├── core/            constants, the config schema, the transform registry,
│                    the `translatable` marker. Host values arrive as thunks
│                    so the registry stays vscode-free too.
├── features/        VS Code-facing adapters: one file per feature area,
│                    each turning lib results into edits, pickers and views
├── regex/           the regex worker: protocol, worker entry, host client
├── webview/         the page scripts: RPC schemas shared with features/, and
│                    the TypeScript sources bundled to dist/webview/. Their own
│                    tsconfig — DOM globals, no node/vscode — lives here too.
└── extension.ts     wiring only: vscode + the kit + the above
scripts/
├── build.mjs        esbuild — four entry points (extension, regex worker, two
│                    webview scripts), kit version baked in
├── verify-vsix.mjs  VSIX contents + packaged-worker smoke test
└── l10n.mjs         extract/check the message bundles
media/webview/   the static assets: the tester's HTML template and both
                 stylesheets. The page *scripts* are built from src/webview/;
                 the kit's webview-client is bundled into them
test/
├── unit/            vitest against src/ — no build, no extension host
├── integration/     vitest against dist/ — real worker thread, real bundle
└── eh/              a real VS Code Extension Host (`npm run test:eh`); run by
                     hand, not in CI
```

Three constraints worth knowing before you change things:

1. **`src/lib` must not import `vscode` or the kit.** That is what lets the unit
   tests run in milliseconds with no mock, and it is where almost all the logic
   lives. If a lib function needs a setting, take it as an argument.
2. **Regular expressions must stay in the worker.** `RegExp.exec` cannot be
   interrupted from the thread running it, so evaluating a user-supplied pattern
   on the extension host would make a hung editor a one-keystroke mistake.
3. **Compute every output before applying any edit.** A transform that throws
   halfway through a multi-selection edit leaves the document inconsistent; the
   feature layer computes all outputs first and only then edits.

## Development Workflow

```bash
npm run lint          # eslint (type-checked rules)
npm run typecheck     # tsc --noEmit twice: the host/test project, then src/webview (DOM)
npm run test:unit     # fast, no build required
npm run test:coverage # unit tests with coverage thresholds
npm test              # bundle + unit + integration
npm run check:l10n    # every source string is in the bundles, in both languages
npm run package       # build the VSIX
npm run verify:vsix   # unpack the VSIX and run the packaged worker
```

All of these must pass before a PR is merged; CI runs the same steps on Linux, macOS and Windows.

### Making Changes

- **Adding a transform** means one entry in `src/core/transforms.ts` and one row
  in the table in `test/unit/transforms.test.ts`. Ids are persisted in history
  and in "Apply Again", so a *rename* needs a migration, not just an edit — the
  id list is pinned by a test to make that deliberate.
- **Adding a command** means `src/core/constants.ts`, `package.json`, and a
  handler in `src/extension.ts`. `Record<PlainCommandId, …>` there is derived by
  exclusion, so a command with no handler fails to compile, and
  `test/unit/manifest.test.ts` catches the manifest side.
- **Adding a setting** means the schema in `src/core/config.ts` and
  `contributes.configuration`. The kit's `checkPackageJsonSync` runs at
  activation and in a test, so a mismatch is reported either way.
- **User-facing strings** go through `l10n.t()` with an English default. A string
  declared in a table and translated elsewhere (transform labels, tool
  categories) must be wrapped in `translatable()` from `src/core/i18n.ts`,
  otherwise the extractor cannot see it. Then run `npm run l10n:write` and
  translate the new keys in `l10n/bundle.l10n.ja.json`. Manifest strings live in
  `package.nls*.json`.
- **New behaviour needs a test.** Pure logic → `test/unit/`; anything that needs
  the built bundles or a real worker thread → `test/integration/`.

### Working on the kit alongside this extension

Quick Utils is where `@kkdev92/vscode-ext-kit` gets exercised before a release
goes out to the other extensions that use it. If you are changing the kit:

- Nearly every runtime export of the kit is exercised somewhere here, which is
  what makes this a useful place to try a kit change before it goes out
- The tests take `vscode` from the kit's own mock: `vitest.config.mts` merges the
  kit's Vitest config, which aliases `vscode` to
  `@kkdev92/vscode-ext-kit/testing/vitest`. A gap in the mock shows up here as a
  test failure rather than as a surprise in production
- `test/integration/extension.test.ts` activates the real bundle against that
  mock, which is the closest thing to a smoke test for the kit's wiring

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`.

### Bundled dependencies

- If you add, remove or upgrade a dependency that ships inside the VSIX, update
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `third-party/` to match.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).

## Security and private reports

Follow this project’s private reporting instructions below. If its reporting form is unavailable and no other project contact is listed, use the [shared private contact](https://github.com/kkdev92/.github/blob/main/SECURITY.md#private-contact).

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
- Subject text comes only from what the user chooses: text typed into the
  tester, a file picked through the system open dialog, or the files matching a
  glob the user enters (at most 50, `node_modules` excluded). What was chosen is
  then watched so the subject stays current; nothing else on disk is touched.
- Matches are rendered into the DOM as text nodes and `<mark>` elements, not by
  assembling an HTML string, so subject text cannot become markup.

### Digest algorithms

MD5 and SHA-1 are offered because checksums in the wild still use them (package
registries, legacy ETags, Gravatar). Neither is collision resistant, and neither
should be used to authenticate anything. Choosing one shows a warning with a
"don't ask again" option, and the picker labels them as checksum-only. SHA-256 is
the default.

HMAC is a different construction and remains sound over SHA-1, but SHA-256 is
still the sensible choice. Keys are read as UTF-8 text by default;
`quickUtils.hmacKeyEncoding` reads them as `hex` or `base64` instead, for a key
that is really bytes. A key read the wrong way is the usual reason a computed
value does not match what the other side produced.

### Untrusted and virtual workspaces

The extension declares support for both. It spawns no process other than its
own regex worker and executes nothing from the workspace. The inputs it
processes are the active selection, the clipboard when you ask for it, what you
give the Regex Tester (typed text, a picked file, or files matching a glob you
enter), and the token under the pointer when you hover over it, which is decoded
in memory and shown in the hover, never written anywhere.

The one file it reads without being asked is the workspace's shared snippet
file, `.quick-utils.json`: it is loaded when the extension starts and reloaded
when it changes. In an untrusted workspace it is not read at all.

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
