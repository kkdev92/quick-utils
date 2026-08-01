/**
 * Extension-host side of the regex worker.
 *
 * Owns one worker at a time and the policy for when to give up on it: a
 * request that outlives its timeout is assumed to be backtracking forever, so
 * the worker is terminated and the next request starts a fresh one. Reusing a
 * wedged worker would make every later request time out too.
 */

import { Worker } from 'node:worker_threads';
import { join } from 'node:path';

import { TimeoutError, measureTime, withTimeout, type Logger } from '@kkdev92/vscode-ext-kit';

import type { RegexMatchResult } from '../lib/regex';
import { RegexError } from '../lib/regex';
import type { RegexRequest, RegexResponse } from './protocol';

/** Location of the bundled worker, alongside `extension.js` in `dist/`. */
export function defaultWorkerPath(): string {
  return join(__dirname, 'regex-worker.js');
}

/**
 * Thrown when a pattern is abandoned for exceeding its time budget. Distinct
 * from {@link RegexError} (a pattern the engine rejected outright) because the
 * two need different advice: fix the syntax, versus fix the backtracking.
 */
export class RegexTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Pattern did not finish within ${String(timeoutMs)}ms and was abandoned.`);
    this.name = 'RegexTimeoutError';
  }
}

export class RegexClient {
  private worker: Worker | undefined;
  private nextId = 1;
  /** Serialises requests: one wedged pattern must not be able to hide behind another. */
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly workerPath: string,
    private readonly logger: Logger
  ) {}

  /**
   * Runs a pattern against `input`.
   *
   * @param request - Pattern, flags, subject and match limit
   * @param timeoutMs - Budget after which the worker is abandoned
   * @param signal - Aborts the wait. The worker is restarted, because a
   *   pattern that was still running is assumed to still be backtracking.
   * @throws {RegexError} If the pattern or flags are invalid.
   * @throws {RegexTimeoutError} If the pattern exceeds `timeoutMs`.
   */
  async run(
    request: Omit<RegexRequest, 'id'>,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<RegexMatchResult> {
    const run = async (): Promise<RegexMatchResult> => {
      if (this.disposed) {
        throw new Error('RegexClient has been disposed');
      }

      const id = this.nextId++;
      const worker = this.ensureWorker();
      // withTimeout owns this promise's rejection from here on — including the
      // already-aborted-signal path, which 2.0.1 fixed to claim the rejection
      // before throwing rather than stranding it as an unhandled rejection.
      const pending = this.exchange(worker, { ...request, id });

      try {
        const { result, duration } = await measureTime(
          'regex',
          () => withTimeout(pending, timeoutMs, { signal }),
          { logger: this.logger }
        )();
        this.logger.trace('matched', {
          matches: result.matches.length,
          truncated: result.truncated,
          durationMs: Math.round(duration),
        });
        return result;
      } catch (error) {
        if (error instanceof TimeoutError) {
          this.logger.warn('Pattern exceeded its time budget; restarting the worker', {
            timeoutMs,
            pattern: request.pattern,
          });
          this.restart();
          throw new RegexTimeoutError(timeoutMs);
        }
        // An abort leaves the worker mid-pattern; the next request needs a
        // thread that is actually idle.
        if (signal?.aborted === true) {
          this.restart();
        }
        throw error;
      }
    };

    // Chain onto the queue without letting a rejection break the chain.
    const chained = this.queue.then(run, run);
    this.queue = chained.catch(() => undefined);
    return chained;
  }

  /** Sends one request and resolves with its reply. */
  private exchange(worker: Worker, request: RegexRequest): Promise<RegexMatchResult> {
    return new Promise<RegexMatchResult>((resolve, reject) => {
      const onMessage = (response: RegexResponse): void => {
        // A reply from a request we already gave up on: ignore it rather than
        // resolving the wrong promise.
        if (response.id !== request.id) {
          return;
        }
        cleanup();
        if (response.ok) {
          resolve({ matches: response.matches, truncated: response.truncated });
        } else {
          reject(new RegexError(response.error));
        }
      };

      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };

      const onExit = (code: number): void => {
        cleanup();
        reject(new Error(`Regex worker exited with code ${String(code)}`));
      };

      const cleanup = (): void => {
        worker.off('message', onMessage);
        worker.off('error', onError);
        worker.off('exit', onExit);
      };

      worker.on('message', onMessage);
      worker.on('error', onError);
      worker.on('exit', onExit);
      worker.postMessage(request);
    });
  }

  private ensureWorker(): Worker {
    if (this.worker === undefined) {
      this.logger.debug('Starting regex worker', { path: this.workerPath });
      const worker = new Worker(this.workerPath);
      // Nothing is waiting on this worker between requests, so a crash while
      // idle must not surface as an unhandled 'error' event.
      worker.on('error', (error) => {
        this.logger.error(error);
      });
      // Do not hold the extension host's event loop open.
      worker.unref();
      this.worker = worker;
    }
    return this.worker;
  }

  private restart(): void {
    const worker = this.worker;
    this.worker = undefined;
    void worker?.terminate();
  }

  dispose(): void {
    this.disposed = true;
    this.restart();
  }
}
