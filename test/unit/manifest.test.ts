/**
 * Manifest consistency.
 *
 * `package.json` and `src/core/constants.ts` describe the same set of commands,
 * settings and views, and nothing at build time notices when they drift: a
 * command missing from the manifest is simply invisible in the palette, and a
 * setting missing from `contributes.configuration` silently reads its default
 * forever. These assertions are the thing that notices.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { COMMANDS, CONFIG, EXTENSION_ID, REGEX_TESTER_VIEW_TYPE, VIEWS } from '../../src/core/constants';

interface Manifest {
  name: string;
  activationEvents: string[];
  contributes: {
    commands: { command: string; title: string; category?: string }[];
    configuration: { properties: Record<string, unknown> };
    views: Record<string, { id: string; type?: string }[]>;
    menus: Record<string, { command?: string; submenu?: string; when?: string }[]>;
    keybindings: { command: string }[];
  };
}

const manifest = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf8')
) as Manifest;

const nlsEnglish = JSON.parse(
  readFileSync(join(__dirname, '../../package.nls.json'), 'utf8')
) as Record<string, string>;

const declaredCommands = new Set(manifest.contributes.commands.map((entry) => entry.command));
const declaredSettings = new Set(Object.keys(manifest.contributes.configuration.properties));

describe('commands', () => {
  it('declares every command the code knows about', () => {
    for (const command of Object.values(COMMANDS)) {
      expect(declaredCommands).toContain(command);
    }
  });

  it('declares no command the code does not implement', () => {
    const known = new Set<string>(Object.values(COMMANDS));
    for (const command of declaredCommands) {
      expect(known).toContain(command);
    }
  });

  it('namespaces every command under the extension id', () => {
    for (const command of declaredCommands) {
      expect(command.startsWith(`${EXTENSION_ID}.`)).toBe(true);
    }
  });

  it('localises every command title through package.nls.json', () => {
    for (const entry of manifest.contributes.commands) {
      expect(entry.title).toMatch(/^%.+%$/);
      expect(nlsEnglish).toHaveProperty(entry.title.slice(1, -1));
    }
  });

  it('gives every command a palette category', () => {
    for (const entry of manifest.contributes.commands) {
      expect(entry.category).toBe('Quick Utils');
    }
  });
});

describe('settings', () => {
  it('declares every key the config schema reads', () => {
    for (const key of Object.values(CONFIG)) {
      expect(declaredSettings).toContain(`${EXTENSION_ID}.${key}`);
    }
  });

  it('declares no setting the config schema does not read', () => {
    const known = new Set(Object.values(CONFIG).map((key) => `${EXTENSION_ID}.${key}`));
    for (const key of declaredSettings) {
      expect(known).toContain(key);
    }
  });

  it('localises every setting description', () => {
    for (const property of Object.values(manifest.contributes.configuration.properties)) {
      const description = (property as { description?: string }).description;
      expect(description).toMatch(/^%.+%$/);
      expect(nlsEnglish).toHaveProperty((description ?? '').slice(1, -1));
    }
  });
});

describe('views', () => {
  it('declares every view under the extension’s container', () => {
    const ids = (manifest.contributes.views[EXTENSION_ID] ?? []).map((view) => view.id);
    expect(ids).toEqual([VIEWS.TOOLS, VIEWS.HISTORY, VIEWS.SCRATCHPAD]);
  });

  it('declares the scratchpad as a webview, which is what lets it host a page', () => {
    const scratchpad = (manifest.contributes.views[EXTENSION_ID] ?? []).find(
      (view) => view.id === VIEWS.SCRATCHPAD
    );
    expect(scratchpad?.type).toBe('webview');
  });
});

describe('activation', () => {
  it('declares the webview activation event, without which the panel cannot be restored', () => {
    expect(manifest.activationEvents).toContain(`onWebviewPanel:${REGEX_TESTER_VIEW_TYPE}`);
  });
});

describe('menus and keybindings', () => {
  it('references only declared commands', () => {
    const referenced = [
      ...Object.values(manifest.contributes.menus).flat().map((entry) => entry.command),
      ...manifest.contributes.keybindings.map((entry) => entry.command),
    ].filter((command): command is string => command !== undefined);

    for (const command of referenced) {
      expect(declaredCommands).toContain(command);
    }
  });

  it('hides the tree-item commands from the palette, where they have no argument', () => {
    const hidden = new Set(
      (manifest.contributes.menus.commandPalette ?? [])
        .filter((entry) => entry.when === 'false')
        .map((entry) => entry.command)
    );
    expect(hidden).toContain(COMMANDS.HISTORY_COPY);
    expect(hidden).toContain(COMMANDS.HISTORY_REAPPLY);
    expect(hidden).toContain(COMMANDS.HISTORY_LOAD_MORE);
  });
});
