/**
 * The regex worker.
 *
 * Its entire reason for existing is that `RegExp.exec` cannot be interrupted.
 * A pattern like `/(a+)+$/` against forty `a`s and a `b` backtracks for longer
 * than anyone will wait, and no timeout on the calling thread can stop it —
 * the event loop never gets control back. Running it on a worker thread means
 * the host can give up and call `terminate()`, which V8 honours even inside a
 * tight loop.
 *
 * So this file must stay tiny and `vscode`-free: it is a bundle of its own.
 */

import { parentPort } from 'node:worker_threads';

import { compileRegex, findMatches } from '../lib/regex';
import type { RegexRequest, RegexResponse } from './protocol';

if (parentPort === null) {
  throw new Error('regex worker must be started as a worker thread');
}

const port = parentPort;

port.on('message', (request: RegexRequest) => {
  let response: RegexResponse;
  try {
    const regex = compileRegex(request.pattern, request.flags);
    const { matches, truncated } = findMatches(regex, request.input, request.limit);
    response = { id: request.id, ok: true, matches, truncated };
  } catch (error) {
    response = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  port.postMessage(response);
});
