/**
 * `quickUtils.logLevel`, applied.
 *
 * The framework logs into a `LogOutputChannel`, and VS Code filters that by the
 * level chosen in the Output panel — per channel, persisted, and not something
 * an extension can raise for itself. So this setting is a *floor* on top of
 * that: it can make the log quieter, never louder. `Developer: Set Log Level`
 * is what turns `debug` back on.
 *
 * The kit's `filterLogger` applies it, reading the level per call rather than
 * once: the services that hold a logger are singletons built at activation, and
 * capturing the level would make the setting take effect only after a reload,
 * which is not what a settings change looks like anywhere else here.
 */

import { serviceToken, type Logger, type ServiceToken } from '@kkdev92/vscode-ext-kit';

/**
 * The logger everything in this extension is given.
 *
 * A token rather than the framework's `Log` directly, because the ambient set
 * in `./services` names one logger for the whole module — swapping it here is
 * what makes the setting apply to every feature at once, instead of each one
 * remembering to wrap.
 */
export const AppLog: ServiceToken<Logger> = serviceToken<Logger>('quickUtils.log');
