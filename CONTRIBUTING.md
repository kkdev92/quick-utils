# Contributing to quick-utils

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Code of Conduct

Please be respectful and constructive in all interactions.

## Getting Started

### Prerequisites

- Node.js 20.x or later
- npm 10.x or later
- VS Code 1.96.0 or later
- Git

### Development Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/quick-utils.git
   cd quick-utils
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the extension:
   ```bash
   npm run compile
   ```

4. Open in VS Code:
   ```bash
   code .
   ```

5. Press `F5` to launch the Extension Development Host

## Project Structure

```
src/
├── extension.ts              # Entry point (activate / deactivate)
├── commands/
│   ├── index.ts              # Command registration & handler map
│   ├── textTransform.ts      # Text transformation commands
│   ├── jsonTools.ts          # JSON format / minify commands
│   ├── codeGenerate.ts       # UUID, Lorem Ipsum, Date insertion
│   └── apiTools.ts           # API key management & history clear
├── providers/
│   ├── toolsTreeProvider.ts  # Tools list TreeView (SimpleTreeDataProvider)
│   └── historyTreeProvider.ts # History TreeView (BaseTreeDataProvider)
├── services/
│   ├── settingsService.ts    # Typed settings management
│   ├── historyService.ts     # Operation history (GlobalStorage)
│   └── apiService.ts         # API calls with retry & SecretStorage
├── utils/
│   ├── transformers.ts       # Pure transform functions
│   └── validators.ts         # Input validation utilities
└── webview/
    └── regexTester.ts        # Regex Tester WebView panel

media/
├── icon.svg                  # Activity Bar icon
└── webview/
    ├── regex-tester.html     # WebView HTML template
    ├── regex-tester.css      # WebView styles
    └── regex-tester.js       # WebView client-side script

l10n/
├── bundle.l10n.json          # English strings
└── bundle.l10n.ja.json       # Japanese strings

test/
├── transformers.test.ts      # Transformer unit tests
└── validators.test.ts        # Validator unit tests
```

## Development Workflow

### Making Changes

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes

3. Run linting:
   ```bash
   npm run lint
   ```

4. Run tests:
   ```bash
   npm run test
   ```

5. Compile:
   ```bash
   npm run compile
   ```

6. Package (optional, to verify VSIX builds):
   ```bash
   npm run package
   ```

### Commit Messages

Follow conventional commit format:
- `feat: add new feature`
- `fix: fix bug in X`
- `docs: update documentation`
- `refactor: restructure X`
- `test: add tests for X`
- `chore: update dependencies`

### Pull Requests

1. Ensure all tests pass
2. Update documentation if needed
3. Add a clear description of changes
4. Reference any related issues

## Coding Standards

### TypeScript

- Use strict TypeScript (`strict: true`)
- ESM imports with `.js` extension for relative paths (the project uses `"type": "module"`)
- Prefer explicit types over inference for function parameters and return types
- Use `readonly` for immutable properties
- Avoid `any` — use `unknown` if type is truly unknown

### vscode-ext-kit

This extension uses `@kkdev92/vscode-ext-kit` extensively. When adding features:

- Use kit APIs when available (e.g. `createWebViewPanel`, `createTreeView`, `createFileWatcher`)
- Use `t()` from the kit for all user-facing strings (localization)
- Use `safeExecute` / `registerCommands` with `wrapWithSafeExecute` for error-safe command execution
- Use kit's `Logger` instead of `console.log`

### Security

- Never hardcode secrets — use `createSecretStorage` from the kit
- Always validate user input before transformation (see `src/utils/validators.ts`)
- Use CSP with nonce for WebView panels (`generateCSP`)

### Error Handling

- Show user-friendly messages with `showError` / `showInfo`
- Log technical details for debugging with `logger.warn` / `logger.debug`
- Use `showWithActions` when the user can take a follow-up action (e.g. undo)

### Testing

- Write unit tests for all new utility functions
- Include both positive and negative test cases
- Test edge cases and error conditions
- Tests use Vitest — run with `npm run test`

## Reporting Issues

When reporting issues, please include:

- VS Code version
- Extension version
- Operating system and version
- Steps to reproduce
- Expected vs actual behavior
- Any error messages from the Output panel (`View > Output > Quick Utils`)

## Feature Requests

Feature requests are welcome! Please:

1. Check existing issues first
2. Describe the use case
3. Explain why it would be valuable

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
