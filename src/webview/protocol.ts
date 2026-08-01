/**
 * RPC contracts shared by the extension host and the webview bundles.
 *
 * Both sides are typed against these interfaces — the host through
 * `createWebviewRpc` (via the managed panel/view wrappers) and the page
 * scripts through `createWebviewRpcClient` — so the contract cannot drift
 * between the two bundles. That is only possible because this module is
 * `vscode`-free: it must be importable from code that runs where the `vscode`
 * module does not exist.
 *
 * Direction convention (the kit's): each field is named after the side that
 * *answers*. `hostRequests` are answered by the host and sent by the webview;
 * `hostEvents` are emitted by the host and received by the webview.
 */

import type { WebviewRpcSchema } from '@kkdev92/vscode-ext-kit/webview-client';

import type { RegexMatch } from '../lib/regex';

// ---- Regex Tester ---------------------------------------------------------

/** The subject text the tester is running against. */
export interface Subject {
  /** Where it came from, for display. */
  name: string;
  text: string;
}

/** What the host sends back for a match request. */
export interface TestResult {
  matches: RegexMatch[];
  truncated: boolean;
  /**
   * Ready-to-display count, formatted on the host.
   *
   * Pluralisation belongs where `vscode.env.language` and the message bundle
   * are — the webview would otherwise need its own copy of both.
   */
  summary: string;
  /** Set instead of matches when the pattern is invalid or timed out. */
  error?: string;
}

export interface RegexTesterSchema extends WebviewRpcSchema {
  hostRequests: {
    test: {
      params: { pattern: string; flags: string; input: string };
      result: TestResult;
    };
    loadFromEditor: { params: null; result: Subject | null };
    loadFromFile: { params: null; result: Subject | null };
    loadFromGlob: { params: null; result: Subject | null };
    revealMatch: { params: { index: number; length: number }; result: null };
  };
  hostEvents: {
    /** Pushes a new subject, e.g. after the bound file changed on disk. */
    subject: Subject;
  };
  webviewEvents: {
    /** Sent once the webview's script is listening. */
    ready: null;
  };
}

// ---- Scratchpad -----------------------------------------------------------

/** Result of running one transform over the scratchpad's input. */
export interface ScratchResult {
  output: string;
  /** Set instead of `output` when the transform rejected the input. */
  error?: string;
}

export interface ScratchpadSchema extends WebviewRpcSchema {
  hostRequests: {
    transform: { params: { id: string; input: string }; result: ScratchResult };
    copy: { params: { text: string }; result: null };
    /** `message` carries the localised reason, so the webview needs no bundle of its own. */
    insert: { params: { text: string }; result: { inserted: boolean; message?: string } };
  };
}
