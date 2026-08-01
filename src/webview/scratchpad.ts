/**
 * Scratchpad — the page script.
 *
 * Transforms run on the extension host, not here: the same registry that backs
 * the commands answers each `transform` request, so the sidebar can never
 * disagree with what `Ctrl+Alt+T` would have produced.
 *
 * Bundled to `dist/webview/scratchpad.js`, typed against the same
 * {@link ScratchpadSchema} as the host.
 */

import { createWebviewRpcClient } from '@kkdev92/vscode-ext-kit/webview-client';
import { debounce } from '@kkdev92/vscode-ext-kit/timing';

import type { ScratchpadSchema } from './protocol';

// Acquired here and shared with the RPC client — this script also needs
// getState/setState, and VS Code allows exactly one acquireVsCodeApi() call.
const vscodeApi = acquireVsCodeApi();
const rpc = createWebviewRpcClient<ScratchpadSchema>({ vscodeApi });

/** The page is authored alongside this script, so a missing id is a build bug. */
function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) {
    throw new Error(`missing element: ${id}`);
  }
  return found as T;
}

const transformSelect = element<HTMLSelectElement>('transform');
const inputArea = element<HTMLTextAreaElement>('input');
const outputArea = element<HTMLTextAreaElement>('output');
const statusEl = element<HTMLParagraphElement>('status');

// ---- State ------------------------------------------------------------------

/** The sidebar is torn down whenever its container is switched away from. */
interface SavedState {
  input: string;
  transform: string;
}

function restoreState(raw: unknown): SavedState | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const record = raw as Partial<Record<keyof SavedState, unknown>>;
  return {
    input: typeof record.input === 'string' ? record.input : '',
    transform: typeof record.transform === 'string' ? record.transform : '',
  };
}

const saved = restoreState(vscodeApi.getState());
if (saved !== undefined) {
  inputArea.value = saved.input;
  if (saved.transform.length > 0) {
    transformSelect.value = saved.transform;
  }
}

function saveState(): void {
  const state: SavedState = { input: inputArea.value, transform: transformSelect.value };
  vscodeApi.setState(state);
}

function setStatus(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.className = isError ? 'status error' : 'status';
}

// ---- Running ----------------------------------------------------------------

/** A slower earlier run must not overwrite a newer result. */
let runToken = 0;

async function run(): Promise<void> {
  const token = ++runToken;
  const input = inputArea.value;

  if (input.length === 0) {
    outputArea.value = '';
    setStatus('');
    return;
  }

  let result;
  try {
    result = await rpc.request('transform', { id: transformSelect.value, input });
  } catch (error) {
    if (token === runToken) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
    return;
  }

  if (token !== runToken) {
    return;
  }

  if (typeof result.error === 'string') {
    outputArea.value = '';
    setStatus(result.error, true);
    return;
  }

  outputArea.value = result.output;
  setStatus('');
}

const runSoon = debounce(() => {
  void run();
}, 200);

inputArea.addEventListener('input', () => {
  saveState();
  runSoon();
});

transformSelect.addEventListener('change', () => {
  saveState();
  void run();
});

// ---- Actions ----------------------------------------------------------------

element<HTMLButtonElement>('copy').addEventListener('click', () => {
  if (outputArea.value.length === 0) {
    return;
  }
  rpc.request('copy', { text: outputArea.value }).then(
    () => {
      setStatus('');
    },
    () => undefined
  );
});

element<HTMLButtonElement>('insert').addEventListener('click', () => {
  if (outputArea.value.length === 0) {
    return;
  }
  rpc.request('insert', { text: outputArea.value }).then(
    (result) => {
      // The host supplies the localised message; this bundle carries no strings.
      setStatus(result.inserted ? '' : (result.message ?? ''), !result.inserted);
    },
    () => undefined
  );
});

// Chaining transforms: feed the result back in as the next input.
element<HTMLButtonElement>('swap').addEventListener('click', () => {
  if (outputArea.value.length === 0) {
    return;
  }
  inputArea.value = outputArea.value;
  saveState();
  void run();
});

if (inputArea.value.length > 0) {
  void run();
}
