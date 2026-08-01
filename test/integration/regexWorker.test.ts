/**
 * The regex worker, against the built bundle.
 *
 * These tests are the reason the worker exists. A backtracking pattern cannot be
 * interrupted on the thread running it, so the only way to survive one is to run
 * it somewhere the host can terminate — and that property is only real if it is
 * exercised against the code that actually ships.
 *
 * Requires `npm run bundle`.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createMockLogger } from '@kkdev92/vscode-ext-kit/testing';

import { RegexClient, RegexTimeoutError } from '../../src/regex/client';
import { RegexError } from '../../src/lib/regex';
import type { RegexRequest, RegexResponse } from '../../src/regex/protocol';

const workerPath = join(__dirname, '../../dist/regex-worker.js');

/** A pattern that backtracks for far longer than any test will wait. */
const CATASTROPHIC = { pattern: '(a+)+$', input: `${'a'.repeat(40)}b` };

let client: RegexClient | undefined;

function makeClient(): RegexClient {
  client = new RegexClient(workerPath, createMockLogger(vi));
  return client;
}

beforeAll(() => {
  if (!existsSync(workerPath)) {
    throw new Error(`${workerPath} is missing. Run \`npm run bundle\` first.`);
  }
});

afterEach(() => {
  client?.dispose();
  client = undefined;
});

describe('the packaged worker', () => {
  it('answers a request over the raw protocol', async () => {
    const worker = new Worker(workerPath);
    try {
      const response = await new Promise<RegexResponse>((resolve, reject) => {
        worker.once('message', resolve);
        worker.once('error', reject);
        const request: RegexRequest = {
          id: 1,
          pattern: '(\\d+)',
          flags: 'g',
          input: 'a1 b22',
          limit: 10,
        };
        worker.postMessage(request);
      });

      expect(response).toMatchObject({ id: 1, ok: true, truncated: false });
      expect(response.ok && response.matches.map((match) => match.text)).toEqual(['1', '22']);
    } finally {
      await worker.terminate();
    }
  });

  it('carries Unicode property escapes and non-ASCII input through the bundle', async () => {
    const result = await makeClient().run(
      { pattern: '\\p{Script=Han}+', flags: 'gu', input: '注文 123 明細', limit: 10 },
      5000
    );
    expect(result.matches.map((match) => match.text)).toEqual(['注文', '明細']);
  });

  it('reports named and numbered groups', async () => {
    const result = await makeClient().run(
      { pattern: '(?<user>\\w+)@(\\w+)', flags: 'g', input: 'me@here', limit: 10 },
      5000
    );
    expect(result.matches[0]).toMatchObject({
      text: 'me@here',
      captures: ['me', 'here'],
      groups: { user: 'me' },
    });
  });

  it('reports the limit being reached', async () => {
    const result = await makeClient().run(
      { pattern: 'a', flags: 'g', input: 'a'.repeat(20), limit: 5 },
      5000
    );
    expect(result.matches).toHaveLength(5);
    expect(result.truncated).toBe(true);
  });

  it('surfaces an invalid pattern as a RegexError, not a crash', async () => {
    await expect(
      makeClient().run({ pattern: '(', flags: '', input: 'x', limit: 10 }, 5000)
    ).rejects.toBeInstanceOf(RegexError);
  });

  it('stays usable after an invalid pattern', async () => {
    const live = makeClient();
    await expect(
      live.run({ pattern: '[', flags: '', input: 'x', limit: 10 }, 5000)
    ).rejects.toBeInstanceOf(RegexError);

    const result = await live.run({ pattern: 'x', flags: 'g', input: 'x', limit: 10 }, 5000);
    expect(result.matches).toHaveLength(1);
  });
});

describe('a pattern that will not finish', () => {
  it('is abandoned at the timeout instead of hanging the caller', async () => {
    const started = Date.now();
    await expect(
      makeClient().run({ ...CATASTROPHIC, flags: '', limit: 10 }, 300)
    ).rejects.toBeInstanceOf(RegexTimeoutError);

    // The whole point: control comes back on the timeout, not when the pattern
    // eventually finishes (which would be minutes to years).
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('leaves the client able to serve the next request', async () => {
    const live = makeClient();
    await expect(live.run({ ...CATASTROPHIC, flags: '', limit: 10 }, 200)).rejects.toBeInstanceOf(
      RegexTimeoutError
    );

    // A wedged worker must be replaced, not reused — otherwise every later
    // request would time out behind it.
    const result = await live.run({ pattern: 'b', flags: 'g', input: 'abc', limit: 10 }, 5000);
    expect(result.matches.map((match) => match.text)).toEqual(['b']);
  });

  it('does not let one wedged request delay an unrelated one indefinitely', async () => {
    const live = makeClient();
    const slow = live.run({ ...CATASTROPHIC, flags: '', limit: 10 }, 200);
    const quick = live.run({ pattern: 'z', flags: 'g', input: 'xyz', limit: 10 }, 5000);

    await expect(slow).rejects.toBeInstanceOf(RegexTimeoutError);
    expect((await quick).matches.map((match) => match.text)).toEqual(['z']);
  });

  it('can be cancelled by its caller', async () => {
    const controller = new AbortController();
    const live = makeClient();
    const running = live.run({ ...CATASTROPHIC, flags: '', limit: 10 }, 30_000, controller.signal);
    controller.abort();

    await expect(running).rejects.toThrow();
    // And the client recovers, because an aborted worker is replaced too.
    const result = await live.run({ pattern: 'a', flags: 'g', input: 'a', limit: 10 }, 5000);
    expect(result.matches).toHaveLength(1);
  });
});

describe('after disposal', () => {
  it('refuses further requests', async () => {
    const live = makeClient();
    live.dispose();
    await expect(
      live.run({ pattern: 'a', flags: 'g', input: 'a', limit: 10 }, 1000)
    ).rejects.toThrow(/disposed/);
  });
});
