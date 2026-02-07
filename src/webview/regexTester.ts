import * as vscode from 'vscode';
import {
  type Logger,
  createWebViewPanel,
  generateCSP,
  generateNonce,
  type ManagedWebViewPanel,
  type WebViewMessage,
} from '@kkdev92/vscode-ext-kit';

interface RegexTestPayload {
  pattern: string;
  flags: string;
  input: string;
}

interface RegexResultPayload {
  matches: Array<{
    match: string;
    index: number;
    groups?: Record<string, string>;
  }>;
  error?: string;
}

let currentPanel: ManagedWebViewPanel<RegexTestPayload, RegexResultPayload> | undefined;

/**
 * Opens the Regex Tester webview panel, or reveals it if already open.
 */
export async function openRegexTester(
  context: vscode.ExtensionContext,
  logger: Logger
): Promise<void> {
  // Reveal existing panel if already open
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  // Create a new webview panel
  currentPanel = createWebViewPanel<RegexTestPayload, RegexResultPayload>(context, {
    viewType: 'quickUtils.regexTester',
    title: 'Regex Tester',
    column: vscode.ViewColumn.Beside,
    enableScripts: true,
    retainContext: true,
  });

  // Clear reference when the panel is closed
  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
  });

  // Load the HTML template with a fresh nonce and CSP
  const nonce = generateNonce();
  const csp = generateCSP(currentPanel.native.webview, { nonce });

  await currentPanel.setHtmlFromTemplate('media/webview/regex-tester.html', {
    csp,
    nonce,
  });

  // Handle incoming test requests from the webview
  currentPanel.onMessage((message: WebViewMessage<RegexTestPayload>) => {
    if (message.type === 'test') {
      const { pattern, flags, input } = message.payload;
      const result = testRegex(pattern, flags, input);
      void currentPanel?.postMessage({
        type: 'result',
        payload: result,
      });
    }
  });

  logger.debug('Regex Tester opened');
}

/**
 * Executes a regex against the input and returns all matches (up to 100).
 */
function testRegex(
  pattern: string,
  flags: string,
  input: string
): RegexResultPayload {
  if (!pattern) {
    return { matches: [] };
  }

  try {
    const regex = new RegExp(pattern, flags);
    const matches: RegexResultPayload['matches'] = [];

    if (flags.includes('g')) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(input)) !== null) {
        matches.push({
          match: match[0],
          index: match.index,
          groups: match.groups ? { ...match.groups } : undefined,
        });

        // Prevent infinite loop on zero-length matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }

        // Cap at 100 matches
        if (matches.length >= 100) {
          break;
        }
      }
    } else {
      const match = regex.exec(input);
      if (match) {
        matches.push({
          match: match[0],
          index: match.index,
          groups: match.groups ? { ...match.groups } : undefined,
        });
      }
    }

    return { matches };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { matches: [], error: message };
  }
}
