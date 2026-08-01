# Contributing to Quick Utils

Thanks for taking the time to contribute! This document covers the development setup, project layout and expectations for changes.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating you agree to uphold it.

## Getting Started

### Prerequisites

- Node.js ≥ 22.12 (matches `engines.node`, which follows the kit's floor, and CI)
- VS Code ≥ 1.125 (the floor `@kkdev92/vscode-ext-kit` 2.0 requires)
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
├── build.mjs        esbuild — two entry points, kit version baked in
├── verify-vsix.mjs  VSIX contents + packaged-worker smoke test
└── l10n.mjs         extract/check the message bundles
media/webview/   the static assets: the tester's HTML template and both
                 stylesheets. The page *scripts* are built from src/webview/;
                 the kit's webview-client is bundled into them
test/
├── unit/            vitest against src/ — no build, no extension host
├── integration/     vitest against dist/ — real worker thread, real bundle
└── vscode.ts        the `vscode` module for tests, from the kit's mock kit
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
- `test/vscode.ts` is built on the kit's own `createVSCodeMock`, so a gap in the
  mock shows up here as a test failure rather than as a surprise in production
- `test/integration/extension.test.ts` activates the real bundle against that
  mock, which is the closest thing to a smoke test for the kit's wiring

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`.

### Pull Requests

- One logical change per PR.
- Describe what changed and why; link related issues.
- Update README / CHANGELOG when behaviour changes.
- If you add, remove or upgrade a dependency that ships inside the VSIX, update
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `third-party/` to match.

## Reporting Issues

Use the issue templates. Run **Quick Utils: Report State** and attach its output — it lists your settings, where each came from, and what the extension has stored, which is usually the difference between a one-round-trip issue and a five-round-trip one. It reports secret *names* only, never values.

For security reports, **do not open a public issue** — see [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
