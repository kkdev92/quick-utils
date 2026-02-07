# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability:

1. **Do NOT** create a public GitHub issue
2. Use GitHub's "Report a vulnerability" feature in the Security tab

## Security Measures

This extension implements the following security measures:

### Secret Storage

- API keys are stored using VS Code's `SecretStorage` API, which delegates to the OS keychain (Keychain on macOS, Credential Manager on Windows, libsecret on Linux)
- Secrets are never written to settings, files, or logs

### WebView Content Security Policy

- All WebView panels enforce a strict CSP with nonce-based script execution
- CSP is generated using `generateCSP()` from vscode-ext-kit
- Only scripts with the correct nonce attribute are allowed to execute
- External resources are blocked by default (`default-src 'none'`)

### Input Validation

- JSON input is validated with `JSON.parse()` before formatting or minification
- Base64 input is checked for valid characters, correct padding, and round-trip consistency
- Regex patterns are validated before construction to prevent errors
- All user-configurable values (history size, log level) are constrained by schema in `package.json`

### No Telemetry

- This extension does not collect or send any telemetry data
- No external network requests are made unless you explicitly use the API feature
- API calls are only made to endpoints you configure yourself

## Security Considerations for Users

1. **API Key**: If you use the API feature, your key is stored in the OS keychain. Uninstalling the extension does not automatically remove the stored key — use "Clear API Key" first if needed.
2. **File Watcher**: The extension watches for `.quickutilsrc` files in your workspace. Only open workspaces you trust.
3. **Regex Tester**: Regex evaluation runs in the extension host process, not in a sandbox. Extremely complex patterns could cause high CPU usage due to catastrophic backtracking — the tester limits results to 100 matches.

## Known Limitations

- The regex tester does not enforce a per-match timeout. Pathological patterns (e.g. `(a+)+$`) against adversarial input may cause temporary unresponsiveness.
- The extension does not yet support Workspace Trust restrictions (planned for a future release).
