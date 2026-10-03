/**
 * `quickUtils.logLevel`, applied to the whole extension.
 *
 * The floor itself is the kit's `filterLogger`, which has its own tests. What
 * only this extension can show is the wiring: `AppLog` reads the setting on
 * every entry, so a change applies to services built long before it — the
 * history store here, constructed once with a scoped child — without a reload.
 */

import { describe, expect, it } from 'vitest';

import { createTestHost } from '@kkdev92/vscode-ext-kit/testing';

import { HistoryClear } from '../../src/core/commands';
import { CONFIG, EXTENSION_ID } from '../../src/core/constants';
import { plan } from '../../src/extension';

describe('the logLevel setting', () => {
  it('quiets services already built, and lets them speak again when lowered', async () => {
    const host = createTestHost({ plan });
    host.settings._set(EXTENSION_ID, CONFIG.LOG_LEVEL, 'globalValue', 'warn');
    await host.start();
    const cleared = (): number =>
      host.logs.entries.filter((entry) => entry.message === 'History cleared').length;

    // "Clear" is the confirmation's first action.
    host.notifications._respondWith(0);
    await host.application.commands.execute(HistoryClear);
    const atWarn = cleared();

    // A change arrives the way VS Code reports one: the value, then the event.
    host.settings._set(EXTENSION_ID, CONFIG.LOG_LEVEL, 'globalValue', 'info');
    host.settings._fireChange([`${EXTENSION_ID}.${CONFIG.LOG_LEVEL}`]);
    host.notifications._respondWith(0);
    await host.application.commands.execute(HistoryClear);
    const atInfo = cleared();

    await host.stop();

    expect([atWarn, atInfo]).toEqual([0, 1]);
  });
});
