# Third-Party Notices

Quick Utils is distributed under the MIT License (see [LICENSE](LICENSE)).

The published VSIX also contains third-party code, bundled into the JavaScript
under `dist/`. Its copyright notice and licence are reproduced below; the full
licence text is in [`third-party/`](third-party).

| Component | Version | Licence | Full text |
| --- | --- | --- | --- |
| [`@kkdev92/vscode-ext-kit`](https://github.com/kkdev92/vscode-ext-kit) | 2.1.0 | MIT | [vscode-ext-kit-LICENSE.txt](third-party/vscode-ext-kit-LICENSE.txt) |

Development-only dependencies (TypeScript, esbuild, ESLint, Vitest, vsce and
their transitive dependencies) contribute no code to the VSIX and are not listed
here.

---

## @kkdev92/vscode-ext-kit

Copyright (c) 2026 kkdev92. Licensed under the MIT License.

Bundled into `dist/extension.js`, and its `webview-client` and `timing` entry
points into the page-script bundles under `dist/webview/`. The library has no
runtime dependencies of its own, so nothing else is drawn in with it.
`dist/regex-worker.js` does not use it.

---

## A note on what is *not* here

Everything else the extension relies on comes from the runtime rather than from a
package:

- Digests and the CSPRNG come from Node's built-in `crypto`.
- Word and grapheme segmentation, collation, number, date and relative-time
  formatting come from ICU, via the `Intl` APIs that ship with Node.
- The regex engine is V8's own.

None of these are bundled, so none of them appear above.
