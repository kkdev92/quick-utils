/**
 * Regex Tester — the page script.
 *
 * This script never evaluates the pattern. It sends pattern, flags and subject
 * to the extension host over the kit's typed RPC client, and the host runs
 * them in a worker thread under a timeout. That is the point: a
 * catastrophically backtracking pattern typed in here freezes nothing, because
 * the only thread that could freeze is one the host is willing to kill.
 *
 * Bundled to `dist/webview/regex-tester.js`. Typed against the same
 * {@link RegexTesterSchema} as the host, so a request the host does not answer
 * fails to compile instead of timing out at runtime.
 */

import { createWebviewRpcClient } from '@kkdev92/vscode-ext-kit/webview-client';
import { debounce } from '@kkdev92/vscode-ext-kit/timing';

import type { RegexMatch } from '../lib/regex';
import type { RegexTesterSchema, Subject } from './protocol';

// Acquired here (once per session is all VS Code allows) and shared with the
// RPC client, because this script also needs getState/setState.
const vscodeApi = acquireVsCodeApi();
const rpc = createWebviewRpcClient<RegexTesterSchema>({ vscodeApi });

// ---- Elements ---------------------------------------------------------------

/** The page is authored alongside this script, so a missing id is a build bug. */
function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) {
    throw new Error(`missing element: ${id}`);
  }
  return found as T;
}

const patternInput = element<HTMLInputElement>('pattern');
const flagsInput = element<HTMLInputElement>('flags');
const subjectInput = element<HTMLTextAreaElement>('subject');
const subjectLabel = element<HTMLSpanElement>('subject-label');
const statusEl = element<HTMLParagraphElement>('status');
const highlightEl = element<HTMLPreElement>('highlight');
const matchesEl = element<HTMLOListElement>('matches');

const baseSubjectLabel = subjectLabel.textContent ?? '';

/** Matches from the last successful run, for the reveal-in-editor links. */
let lastMatches: readonly RegexMatch[] = [];

// ---- State ------------------------------------------------------------------

/** What survives the panel being hidden (it is torn down, not kept alive). */
interface SavedState {
  pattern: string;
  flags: string;
  subject: string;
  sourceName?: string;
}

/** `getState` returns whatever was stored; trust nothing about its shape. */
function restoreState(raw: unknown): SavedState | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const record = raw as Partial<Record<keyof SavedState, unknown>>;
  return {
    pattern: typeof record.pattern === 'string' ? record.pattern : '',
    flags: typeof record.flags === 'string' ? record.flags : '',
    subject: typeof record.subject === 'string' ? record.subject : '',
    ...(typeof record.sourceName === 'string' && record.sourceName.length > 0
      ? { sourceName: record.sourceName }
      : {}),
  };
}

const saved = restoreState(vscodeApi.getState());
if (saved !== undefined) {
  patternInput.value = saved.pattern;
  flagsInput.value = saved.flags;
  subjectInput.value = saved.subject;
  if (saved.sourceName !== undefined) {
    subjectLabel.textContent = `${baseSubjectLabel} — ${saved.sourceName}`;
  }
}

function saveState(sourceName?: string): void {
  const previous = restoreState(vscodeApi.getState());
  const state: SavedState = {
    pattern: patternInput.value,
    flags: flagsInput.value,
    subject: subjectInput.value,
    ...(sourceName !== undefined
      ? { sourceName }
      : previous?.sourceName !== undefined
        ? { sourceName: previous.sourceName }
        : {}),
  };
  vscodeApi.setState(state);
}

// ---- Rendering --------------------------------------------------------------

/** Builds the highlighted subject as DOM nodes — never as an HTML string. */
function renderHighlight(subject: string, matches: readonly RegexMatch[]): void {
  highlightEl.replaceChildren();
  if (matches.length === 0) {
    return;
  }

  let cursor = 0;
  for (const match of matches) {
    if (match.index < cursor) {
      continue;
    }
    if (match.index > cursor) {
      highlightEl.append(document.createTextNode(subject.slice(cursor, match.index)));
    }
    const mark = document.createElement('mark');
    // Zero-length matches have nothing to show; a marker keeps them visible.
    mark.textContent = match.text.length === 0 ? '​' : match.text;
    highlightEl.append(mark);
    cursor = match.index + match.text.length;
  }
  if (cursor < subject.length) {
    highlightEl.append(document.createTextNode(subject.slice(cursor)));
  }
}

function renderMatches(matches: readonly RegexMatch[]): void {
  matchesEl.replaceChildren();

  for (const [position, match] of matches.entries()) {
    const item = document.createElement('li');

    const link = document.createElement('button');
    link.type = 'button';
    link.textContent = match.text.length === 0 ? '(empty match)' : match.text;
    link.dataset.position = String(position);
    item.append(link);

    const numbered = match.captures
      .map((value, index) => (value === undefined ? undefined : `$${String(index + 1)}=${value}`))
      .filter((part): part is string => part !== undefined);
    const named = Object.entries(match.groups ?? {}).map(
      ([name, value]) => `${name}=${value ?? ''}`
    );

    const parts = [
      ...(numbered.length > 0 ? [numbered.join(', ')] : []),
      ...(named.length > 0 ? [named.join(', ')] : []),
    ];
    if (parts.length > 0) {
      const groups = document.createElement('span');
      groups.className = 'groups';
      groups.textContent = `  ${parts.join(' · ')}`;
      item.append(groups);
    }

    matchesEl.append(item);
  }
}

matchesEl.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || target.dataset.position === undefined) {
    return;
  }
  const match = lastMatches[Number(target.dataset.position)];
  if (match === undefined) {
    return;
  }
  rpc
    .request('revealMatch', { index: match.index, length: match.text.length })
    .catch(() => undefined); // Nothing to reveal — the subject is not a document.
});

function setStatus(text: string, kind?: 'error' | 'empty'): void {
  statusEl.textContent = text;
  statusEl.className = kind === undefined ? 'status' : `status ${kind}`;
}

// ---- Running ----------------------------------------------------------------

/** A slower earlier run must not overwrite a newer result. */
let runToken = 0;

async function run(): Promise<void> {
  const token = ++runToken;
  const pattern = patternInput.value;
  const subject = subjectInput.value;

  if (pattern.length === 0) {
    lastMatches = [];
    setStatus('');
    renderHighlight(subject, []);
    renderMatches([]);
    return;
  }

  let result;
  try {
    result = await rpc.request('test', { pattern, flags: flagsInput.value, input: subject });
  } catch (error) {
    if (token === runToken) {
      setStatus(error instanceof Error ? error.message : String(error), 'error');
    }
    return;
  }

  if (token !== runToken) {
    return;
  }

  if (typeof result.error === 'string') {
    lastMatches = [];
    setStatus(result.error, 'error');
    renderHighlight(subject, []);
    renderMatches([]);
    return;
  }

  lastMatches = result.matches;
  setStatus(result.summary, result.matches.length === 0 ? 'empty' : undefined);
  renderHighlight(subject, result.matches);
  renderMatches(result.matches);
}

/** Debounce, so a pattern is not re-run on every keystroke of typing it. */
const runSoon = debounce(() => {
  void run();
}, 250);

function scheduleRun(): void {
  saveState();
  runSoon();
}

for (const input of [patternInput, flagsInput, subjectInput]) {
  input.addEventListener('input', scheduleRun);
}

element<HTMLFormElement>('form').addEventListener('submit', (event) => {
  event.preventDefault();
  void run();
});

// ---- Subject sources ----------------------------------------------------------

function applySubject(subject: Subject | null): void {
  if (subject === null) {
    return;
  }
  subjectInput.value = subject.text;
  subjectLabel.textContent = `${baseSubjectLabel} — ${subject.name}`;
  saveState(subject.name);
  void run();
}

element<HTMLButtonElement>('from-editor').addEventListener('click', () => {
  rpc.request('loadFromEditor', null).then(applySubject, () => undefined);
});

element<HTMLButtonElement>('from-file').addEventListener('click', () => {
  rpc.request('loadFromFile', null).then(applySubject, () => undefined);
});

element<HTMLButtonElement>('from-glob').addEventListener('click', () => {
  rpc.request('loadFromGlob', null).then(applySubject, () => undefined);
});

// Pushed by the host when a subject loaded from a file or glob changes on disk.
rpc.onEvent('subject', applySubject);

rpc.emit('ready', null);
if (patternInput.value.length > 0) {
  void run();
}
patternInput.focus();
