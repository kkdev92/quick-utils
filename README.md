# quick-utils

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/kkdev92/quick-utils/actions/workflows/ci.yml/badge.svg)](https://github.com/kkdev92/quick-utils/actions/workflows/ci.yml)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/kkdev92.quick-utils)](https://marketplace.visualstudio.com/items?itemName=kkdev92.quick-utils)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)

A VS Code extension that bundles everyday text transformations, code generation, and utility tools into one place.
Built with [@kkdev92/vscode-ext-kit](https://github.com/kkdev92/vscode-ext-kit) to showcase all 17 modules of the toolkit.

> **Status:** Active (best-effort maintenance)

---

## Table of Contents

- [Why quick-utils](#why-quick-utils)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Configuration](#configuration)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Support & Maintenance Policy](#support--maintenance-policy)
- [License](#license)
- [Acknowledgments](#acknowledgments)

---

## Why quick-utils

Switching between multiple extensions or external tools for simple tasks like case conversion, Base64 encoding, or JSON formatting slows you down.
quick-utils puts all of these common operations behind a single command palette entry, keyboard shortcut, or Activity Bar click — no context switching required.

---

## Features

- **Text Transform**: Convert selected text to UPPER CASE, lower case, camelCase, PascalCase, snake_case, kebab-case, Base64, or URL encoding — with multi-cursor support
- **JSON Format / Minify**: Format or compress selected JSON with validation before transform
- **Code Generation**: Generate UUID v4, Lorem Ipsum paragraphs, or insert formatted dates via a multi-step wizard
- **Regex Tester**: Interactive WebView panel for testing regular expressions with live results
- **Operation History**: Track all operations with relative timestamps in the sidebar
- **Activity Bar**: Dedicated tools panel with categorized tree view
- **Localization**: English and Japanese (l10n)
- **File Watcher**: Monitors `.quickutilsrc` / `.quickutilsrc.json` for project-level configuration changes
- **API Integration**: Secure API key storage with automatic retry and progress reporting

---

## Installation

### Install from VS Code Marketplace (recommended)

- Open the Extensions view (`Ctrl+Shift+X`)
- Search for **quick-utils**
- Click **Install**

You can also open the Marketplace page directly:

- <https://marketplace.visualstudio.com/items?itemName=kkdev92.quick-utils>

### Build from Source (for contributors)

> If you just want to use quick-utils, installing from the Marketplace is the easiest option.

```bash
git clone https://github.com/kkdev92/quick-utils.git
cd quick-utils
npm install
npm run compile
npm run package
```

---

## Quick Start

1. Open a file in VS Code
2. Select some text
3. Press `Ctrl+Shift+T` (or `Cmd+Shift+T` on macOS) to open the transform picker
4. Choose a transformation — done!

You can also click the wrench icon in the Activity Bar to browse all available tools.

---

## Usage

### Text Transformation

Select text and run one of the following commands from the Command Palette (`Ctrl+Shift+P`):

| Command | Description |
| --- | --- |
| `Quick Utils: Transform Text` | Open picker to choose a transform |
| `Quick Utils: To Upper Case` | Convert to UPPER CASE |
| `Quick Utils: To Lower Case` | Convert to lower case |
| `Quick Utils: To camelCase` | Convert to camelCase |
| `Quick Utils: To PascalCase` | Convert to PascalCase |
| `Quick Utils: To snake_case` | Convert to snake_case |
| `Quick Utils: To kebab-case` | Convert to kebab-case |
| `Quick Utils: Base64 Encode` | Encode to Base64 |
| `Quick Utils: Base64 Decode` | Decode from Base64 (validates input) |
| `Quick Utils: URL Encode` | URL-encode the text |
| `Quick Utils: URL Decode` | URL-decode the text |

All transforms support multiple selections (multi-cursor).

### JSON

| Command | Description |
| --- | --- |
| `Quick Utils: Format JSON` | Pretty-print selected JSON (2-space indent) |
| `Quick Utils: Minify JSON` | Compress selected JSON to a single line |

JSON is validated before transformation — you'll see an error message if the input is invalid.

### Code Generation

| Command | Description |
| --- | --- |
| `Quick Utils: Generate UUID` | Insert a random UUID v4 at cursor |
| `Quick Utils: Generate Lorem Ipsum` | Insert 1-5 paragraphs of Lorem Ipsum |
| `Quick Utils: Insert Date` | Insert a formatted date via a multi-step wizard |

### Regex Tester

Run `Quick Utils: Open Regex Tester` to open an interactive WebView panel. Enter a pattern, flags, and test string to see matches in real time.

### Context Menu

Right-click in the editor to access **Quick Utils** submenu with Transform Text, Format JSON, and Generate UUID.

### Activity Bar

Click the wrench icon in the Activity Bar to see:

- **Tools** — categorized list of all tools (click to run)
- **History** — recent operations with relative timestamps

---

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `quickUtils.logLevel` | `"info"` | Log level: `trace`, `debug`, `info`, `warn`, `error`, `silent` |
| `quickUtils.dateFormat` | `"YYYY-MM-DD"` | Default date format for Insert Date command |
| `quickUtils.historySize` | `50` | Maximum number of history entries (0-500) |
| `quickUtils.autoRetry` | `true` | Automatically retry failed API calls with exponential backoff |

---

## Security

This extension is designed with security as a priority:

- API keys are stored in VS Code's built-in SecretStorage (OS keychain)
- WebView panels use a strict Content Security Policy (CSP) with nonce-based script execution
- All user input is validated before processing (JSON, Base64, regex patterns)
- No data is sent externally unless you explicitly configure and use the API feature

For security concerns, please see [SECURITY.md](SECURITY.md).

---

## Troubleshooting

### Transform commands do nothing

- Make sure you have text selected in the editor
- Check that the file is not read-only

### Base64 Decode shows "Invalid Base64 input"

- The selected text must be valid Base64 (A-Z, a-z, 0-9, +, /, =)
- Length must be a multiple of 4

### JSON Format shows "Invalid JSON"

- Ensure the selection is valid JSON (not a fragment or JavaScript object literal)
- Trailing commas and single quotes are not valid JSON

### Regex Tester panel is blank

- Check the Output panel (`View > Output > Quick Utils`) for errors
- Try closing and reopening the panel

---

## Contributing

Contributions are welcome!
Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

If you're planning a larger change, opening an issue first is appreciated (it helps align direction and avoids duplicate work).

---

## Support & Maintenance Policy

quick-utils is a personal hobby project maintained in spare time.
I'll do my best to review issues and PRs, but responses and releases may be a bit slow sometimes — thank you for your patience.

Helpful things when reporting bugs:

- OS / VS Code version
- Your quick-utils settings (only what's relevant)
- Steps to reproduce + expected/actual behavior

Security-related reports should follow [SECURITY.md](SECURITY.md).

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [@kkdev92/vscode-ext-kit](https://github.com/kkdev92/vscode-ext-kit) — The VS Code extension toolkit that powers this extension
- [VS Code Extension API](https://code.visualstudio.com/api) — For making extensibility possible
