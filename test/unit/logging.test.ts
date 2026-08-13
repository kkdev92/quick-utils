/**
 * The `quickUtils.logLevel` floor.
 *
 * Two things are worth pinning here rather than trusting by inspection: that
 * every level is compared against the floor (an off-by-one in the table shows
 * up as one level leaking), and that the level is read *per call*. The second
 * is the reason this wrapper takes a thunk — the services that hold a logger
 * are singletons built once at activation, so capturing the level would make
 * the setting take effect only after a reload.
 */

import { describe, expect, it } from 'vitest';

import type { LogFields, Logger } from '@kkdev92/vscode-ext-kit';

import { filtered, type LogLevel } from '../../src/core/logging';

interface Recorded {
  readonly level: string;
  readonly message: string;
  readonly fields?: LogFields | undefined;
}

/** A logger that records instead of writing, with `withFields` kept faithful. */
function recorder(entries: Recorded[], inherited?: LogFields): Logger {
  const merged = (fields?: LogFields): LogFields | undefined =>
    inherited === undefined && fields === undefined ? undefined : { ...inherited, ...fields };
  return {
    trace: (message, fields): void => {
      entries.push({ level: 'trace', message, fields: merged(fields) });
    },
    debug: (message, fields): void => {
      entries.push({ level: 'debug', message, fields: merged(fields) });
    },
    info: (message, fields): void => {
      entries.push({ level: 'info', message, fields: merged(fields) });
    },
    warn: (message, fields): void => {
      entries.push({ level: 'warn', message, fields: merged(fields) });
    },
    error: (message, _error, fields): void => {
      entries.push({ level: 'error', message, fields: merged(fields) });
    },
    withFields: (fields): Logger => recorder(entries, { ...inherited, ...fields }),
  };
}

/** Logs one entry at every level and returns the levels that got through. */
function levelsThatPass(level: LogLevel): string[] {
  const entries: Recorded[] = [];
  const log = filtered(recorder(entries), () => level);
  log.trace('t');
  log.debug('d');
  log.info('i');
  log.warn('w');
  log.error('e');
  return entries.map((entry) => entry.level);
}

describe('the logLevel floor', () => {
  it('lets everything through at trace', () => {
    expect(levelsThatPass('trace')).toEqual(['trace', 'debug', 'info', 'warn', 'error']);
  });

  it('drops only what is below the floor', () => {
    expect(levelsThatPass('debug')).toEqual(['debug', 'info', 'warn', 'error']);
    expect(levelsThatPass('info')).toEqual(['info', 'warn', 'error']);
    expect(levelsThatPass('warn')).toEqual(['warn', 'error']);
  });

  it('keeps errors at the highest floor', () => {
    expect(levelsThatPass('error')).toEqual(['error']);
  });

  it('re-reads the level on every call, so a settings change applies at once', () => {
    const entries: Recorded[] = [];
    let level: LogLevel = 'info';
    const log = filtered(recorder(entries), () => level);

    log.debug('before');
    level = 'debug';
    log.debug('after');

    expect(entries.map((entry) => entry.message)).toEqual(['after']);
  });

  it('keeps the floor on a scoped child, and its fields', () => {
    const entries: Recorded[] = [];
    const log = filtered(recorder(entries), () => 'warn').withFields({ feature: 'history' });

    log.info('dropped');
    log.warn('kept');

    expect(entries).toEqual([{ level: 'warn', message: 'kept', fields: { feature: 'history' } }]);
  });

  it('passes the error argument through', () => {
    const seen: unknown[] = [];
    const log = filtered(
      {
        trace: (): void => {},
        debug: (): void => {},
        info: (): void => {},
        warn: (): void => {},
        error: (_message, error): void => {
          seen.push(error);
        },
        withFields: function (this: Logger): Logger {
          return this;
        },
      },
      () => 'trace'
    );
    const boom = new Error('boom');

    log.error('failed', boom);

    expect(seen).toEqual([boom]);
  });
});
