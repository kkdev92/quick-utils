/**
 * `quickUtils.logLevel`, applied.
 *
 * The framework logs into a `LogOutputChannel`, and VS Code filters that by the
 * level chosen in the Output panel — per channel, persisted, and not something
 * an extension can raise for itself. So this setting is a *floor* on top of
 * that: it can make the log quieter, never louder. `Developer: Set Log Level`
 * is what turns `debug` back on.
 *
 * The level is read per call rather than captured, because the services that
 * hold a logger are singletons built once at activation — capturing would mean
 * the setting only took effect after a reload, which is not what a settings
 * change looks like anywhere else in this extension.
 */

import { serviceToken, type Logger, type ServiceToken } from '@kkdev92/vscode-ext-kit';

/** The values `quickUtils.logLevel` accepts, in severity order. */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const SEVERITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

/**
 * Wraps `logger` so entries below `level()` are dropped.
 *
 * `withFields` returns a filtered child rather than the bare one, so a scoped
 * logger handed to a feature keeps the floor.
 */
export function filtered(logger: Logger, level: () => LogLevel): Logger {
  const passes = (of: LogLevel): boolean => SEVERITY[of] >= SEVERITY[level()];
  return {
    trace: (message, fields): void => {
      if (passes('trace')) {
        logger.trace(message, fields);
      }
    },
    debug: (message, fields): void => {
      if (passes('debug')) {
        logger.debug(message, fields);
      }
    },
    info: (message, fields): void => {
      if (passes('info')) {
        logger.info(message, fields);
      }
    },
    warn: (message, fields): void => {
      if (passes('warn')) {
        logger.warn(message, fields);
      }
    },
    error: (message, error, fields): void => {
      if (passes('error')) {
        logger.error(message, error, fields);
      }
    },
    withFields: (fields): Logger => filtered(logger.withFields(fields), level),
  };
}

/**
 * The logger everything in this extension is given.
 *
 * A token rather than the framework's `Log` directly, because the ambient set
 * in `./services` names one logger for the whole module — swapping it here is
 * what makes the setting apply to every feature at once, instead of each one
 * remembering to wrap.
 */
export const AppLog: ServiceToken<Logger> = serviceToken<Logger>('quickUtils.log');
