/**
 * The API VS Code injects into every webview.
 *
 * Declared here rather than pulled from `@types/vscode-webview` because these
 * three members are the entire surface this extension touches, and a
 * dependency is a bigger thing to audit than three lines.
 */

interface VsCodeWebviewApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

/** Available exactly once per webview session; a second call throws. */
declare function acquireVsCodeApi(): VsCodeWebviewApi;
