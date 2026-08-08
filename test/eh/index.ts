/**
 * The extension, in a real Extension Host.
 *
 * Everything else in `test/` runs against the kit's `vscode` mock. That proves
 * the wiring is what we think it is; it cannot prove VS Code agrees. This
 * launches the shipped bundle in a real editor and drives it through
 * `executeCommand`, which is the same path a keybinding or the Command Palette
 * takes.
 *
 * Only commands that never prompt are exercised: a modal here would hang the
 * host until the run times out. That rules out the pickers and the
 * confirmations, and leaves the ones that read a document and write it back —
 * which is where a real `WorkspaceEdit` and a real selection actually differ
 * from the fakes.
 */

import assert from 'node:assert/strict';

import * as vscode from 'vscode';

import { COMMANDS } from '../../src/core/constants';

const EXTENSION_ID = 'kkdev92.quick-utils';

/** Opens a document with `text` and selects all of it. */
async function openWithSelection(
  text: string,
  language = 'plaintext'
): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({ content: text, language });
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  await beat(500);
  editor.selection = new vscode.Selection(
    document.positionAt(0),
    document.positionAt(text.length)
  );
  await beat(700);
  return editor;
}

/**
 * Waits for the document to stop being `initial`.
 *
 * `executeCommand` on a text editor command resolves as soon as VS Code's own
 * edit closes — it does *not* await what the handler returns. Verified against
 * `extHost.api.impl.ts`: the wrapper runs the callback inside
 * `activeTextEditor.edit(...)` and discards its return value, logging any
 * rejection rather than propagating it. A handler that does asynchronous work
 * is therefore still running when the caller regains control, so reading the
 * document straight away reads it too early.
 */
async function changedFrom(
  document: vscode.TextDocument,
  initial: string,
  timeoutMs = 5000
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let text = document.getText();
  while (text === initial && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    text = document.getText();
  }
  return text;
}

/** Closes whatever is open, so one case cannot leak into the next. */
async function closeAll(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

/**
 * Demo mode: the same cases, paced so a person can watch them happen.
 *
 * The assertions are identical — this only inserts pauses and narration. A demo
 * that ran different code would not be showing you anything.
 */
const DEMO = process.env['QU_EH_DEMO'] === '1';

/** Multiplies every pause. `QU_EH_PACE=2` runs at half speed. */
const PACE = Number(process.env['QU_EH_PACE'] ?? '1') || 1;

/** Waits, but only when a person is watching. */
async function beat(ms = 1400): Promise<void> {
  if (DEMO) {
    await new Promise((resolve) => setTimeout(resolve, ms * PACE));
  }
}

/** Narrates a step, in the editor's own notification area and on stdout. */
async function say(message: string): Promise<void> {
  if (!DEMO) {
    return;
  }
  process.stdout.write(`         ${message}
`);
  vscode.window.setStatusBarMessage(`$(play)  ${message}`, 3000);
  await beat(900);
}

interface Case {
  readonly name: string;
  /** Shown in demo mode; a case without one is skipped there. */
  readonly demo?: string;
  run: () => Promise<void>;
}

const cases: readonly Case[] = [
  {
    name: 'activates',
    run: async () => {
      const extension = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(extension !== undefined, `${EXTENSION_ID} is not present in this host`);
      await extension.activate();
      assert.equal(extension.isActive, true);
    },
  },

  {
    name: 'registers every command in the manifest',
    run: async () => {
      const registered = new Set(await vscode.commands.getCommands(true));
      const missing = Object.values(COMMANDS).filter((id) => !registered.has(id));
      assert.deepEqual(missing, [], `commands missing from the host: ${missing.join(', ')}`);
    },
  },

  {
    name: 'CONTROL: the host accepts a plain editor.edit()',
    run: async () => {
      const editor = await openWithSelection('control');
      const applied = await editor.edit((builder) => {
        builder.replace(editor.selection, 'CONTROL');
      });
      assert.equal(applied, true, 'the host refused a plain edit');
      assert.equal(editor.document.getText(), 'CONTROL');
      await beat(1800);
      await closeAll();
    },
  },

  {
    name: 'CONTRACT: a text editor command is fire-and-forget',
    run: async () => {
      // Pinned here because the framework's fake cannot show it and the whole
      // repo's error-handling story depends on it: VS Code's
      // `registerTextEditorCommand` wrapper runs the callback inside
      // `activeTextEditor.edit(...)` and then *discards* what it returned,
      // logging a rejection instead of propagating it
      // (`extHost.api.impl.ts`). A synchronous throw still rejects, because it
      // escapes into the enclosing edit.
      const syncThrow = vscode.commands.registerTextEditorCommand('ehProbe.boom', () => {
        throw new Error('probe-boom');
      });
      const asyncThrow = vscode.commands.registerTextEditorCommand('ehProbe.asyncBoom', () =>
        Promise.reject(new Error('probe-async-boom'))
      );
      const returnsValue = vscode.commands.registerTextEditorCommand(
        'ehProbe.value',
        () => 'a value'
      );

      try {
        await openWithSelection('x');

        await assert.rejects(
          Promise.resolve(vscode.commands.executeCommand('ehProbe.boom')),
          /probe-boom/,
          'a synchronous throw should still reach the caller'
        );
        await assert.doesNotReject(
          Promise.resolve(vscode.commands.executeCommand('ehProbe.asyncBoom')),
          'a rejected promise is swallowed — if this starts throwing, VS Code changed'
        );
        assert.equal(
          await vscode.commands.executeCommand('ehProbe.value'),
          undefined,
          'the return value is discarded — if this stops being undefined, VS Code changed'
        );
      } finally {
        syncThrow.dispose();
        asyncThrow.dispose();
        returnsValue.dispose();
        await closeAll();
      }
    },
  },

  {
    name: 'CONTRACT: VS Code accepts a theme icon given as { id }',
    run: async () => {
      // The kit's `toPickItem` emits `{ id }` rather than `new ThemeIcon(id)`,
      // which is what makes it callable without a VS Code runtime. VS Code
      // recognises a theme icon by its `id` (`ThemeIcon.isThemeIcon`), and the
      // conversion runs when the items are assigned — so if the shape were
      // rejected, this is where it would show.
      const picker = vscode.window.createQuickPick();
      try {
        picker.items = [
          { label: 'plain' },
          { label: 'with icon', iconPath: { id: 'symbol-string' } as vscode.ThemeIcon },
        ];
        picker.buttons = [{ iconPath: { id: 'refresh' } as vscode.ThemeIcon, tooltip: 'Reload' }];

        const second = picker.items[1];
        assert.equal(second?.label, 'with icon');
        assert.deepEqual(second?.iconPath, { id: 'symbol-string' });
        assert.equal(picker.buttons.length, 1);
      } finally {
        picker.dispose();
      }
    },
  },

  {
    name: 'transforms the selection through a real WorkspaceEdit',
    demo: 'Upper Case, on the selection',
    run: async () => {
      await say('opening a document and selecting "hello world"');
      const editor = await openWithSelection('hello world');
      await say(`running ${COMMANDS.UPPER_CASE}`);
      await vscode.commands.executeCommand(COMMANDS.UPPER_CASE);
      assert.equal(await changedFrom(editor.document, 'hello world'), 'HELLO WORLD');
      await beat(1800);
      await closeAll();
    },
  },

  {
    name: 'formats JSON, preserving the document language',
    demo: 'Format JSON, with the indent the settings ask for',
    run: async () => {
      await say('opening a minified JSON document');
      const editor = await openWithSelection('{"b":2,"a":1}', 'json');
      await say(`running ${COMMANDS.JSON_FORMAT}`);
      await vscode.commands.executeCommand(COMMANDS.JSON_FORMAT);
      const formatted = await changedFrom(editor.document, '{"b":2,"a":1}');
      assert.ok(formatted.includes('\n'), `expected indented JSON, got ${JSON.stringify(formatted)}`);
      assert.deepEqual(JSON.parse(formatted), { b: 2, a: 1 });
      await beat(1800);
      await closeAll();
    },
  },

  {
    name: 'sorts lines',
    demo: 'Sort Lines',
    run: async () => {
      await say('opening three unsorted lines');
      const unsorted = ['pear', 'apple', 'fig'].join('\n');
      const editor = await openWithSelection(unsorted);
      await say(`running ${COMMANDS.SORT_LINES}`);
      await vscode.commands.executeCommand(COMMANDS.SORT_LINES);
      assert.equal(
        await changedFrom(editor.document, unsorted),
        ['apple', 'fig', 'pear'].join('\n')
      );
      await beat(1800);
      await closeAll();
    },
  },

  {
    name: 'inserts a generated value at the cursor',
    demo: 'Generate UUID, at the cursor',
    run: async () => {
      await say('opening an empty document with the cursor at the start');
      const document = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
      const editor = await vscode.window.showTextDocument(document, { preview: false });
      editor.selection = new vscode.Selection(0, 0, 0, 0);
      await beat(700);

      await say(`running ${COMMANDS.GENERATE_UUID}`);
      await vscode.commands.executeCommand(COMMANDS.GENERATE_UUID);
      assert.match(
        (await changedFrom(document, '')).trim(),
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      );
      await beat(1800);
      await closeAll();
    },
  },

  {
    name: 'declares its status bar item and both tree views',
    run: async () => {
      // A tree view is only observable through the command that reveals it;
      // `focus` is contributed by VS Code for every declared view, so its
      // presence is what proves the registration reached the host.
      const registered = new Set(await vscode.commands.getCommands(true));
      for (const view of ['quickUtils.tools', 'quickUtils.history', 'quickUtils.scratchpad']) {
        assert.ok(registered.has(`${view}.focus`), `view "${view}" was not registered`);
      }
    },
  },

  {
    name: 'reads its settings through the real configuration service',
    run: async () => {
      const configuration = vscode.workspace.getConfiguration('quickUtils');
      // Declared in package.json and read through `defineSettings`; a mismatch
      // between the two is exactly what the mock cannot see.
      assert.equal(typeof configuration.get('regexTimeoutMs'), 'number');
      assert.equal(typeof configuration.get('showStatusBar'), 'boolean');
    },
  },

  {
    name: 'skips an editor command when no editor has focus',
    run: async () => {
      await closeAll();
      // What `registerTextEditorCommand` actually buys: VS Code does not call
      // the handler at all, it logs "no active text editor" and resolves. It
      // does *not* grey the palette entry out — that is the `enablement` /
      // `commandPalette` `when` clause in package.json, and it is checked by
      // test/unit/manifest.test.ts.
      await assert.doesNotReject(Promise.resolve(vscode.commands.executeCommand(COMMANDS.UPPER_CASE)));
      assert.equal(vscode.window.activeTextEditor, undefined);
    },
  },

  {
    name: 'the managed raw registration reached the real languages API',
    run: async () => {
      // The one place this extension registers past the framework. A fake
      // cannot settle it: `createTestHost` binds the raw registration against a
      // spy that hands back a disposable, so the *only* thing that proves VS
      // Code accepted the provider — and that a hover is actually produced for
      // a token in a document — is asking the workbench for one.
      const document = await vscode.workspace.openTextDocument({
        content: 'token aGVsbG8gd29ybGQ= end',
        language: 'plaintext',
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
        'vscode.executeHoverProvider',
        document.uri,
        document.positionAt(document.getText().indexOf('aGVsbG8') + 2)
      );

      const rendered = (hovers ?? [])
        .flatMap((hover) => hover.contents)
        .map((content) => (typeof content === 'string' ? content : content.value))
        .join('\n');
      assert.ok(
        rendered.includes('hello world'),
        `no decoded hover came back from the host: ${rendered || '(nothing)'}`
      );
      await closeAll();
    },
  },

  // No case for the preset commands, deliberately. Both of them end in a
  // notification or a status flash, and neither is observable from here — while
  // a notification is exactly what the header of this file says will hang the
  // host. What they do is already pinned where it can be: parsing and the store
  // in test/unit/presets.test.ts, and the declared watcher reaching the plan in
  // test/integration/testHost.test.ts.
];

/** VS Code's entry point for `extensionTestsPath`. */
export async function run(): Promise<void> {
  const failures: string[] = [];
  // Demo mode shows only the cases with something to look at. The rest assert
  // things that are invisible by nature — what a callback received, whether a
  // rejection propagated — and skipping them keeps the window on the point.
  const selected = DEMO ? cases.filter((testCase) => testCase.demo !== undefined) : cases;

  if (DEMO) {
    process.stdout.write(
      `\n  Quick Utils on VS Code ${vscode.version} — ${String(selected.length)} things to watch\n\n`
    );
    await beat(2500);
  }

  for (const testCase of selected) {
    if (DEMO && testCase.demo !== undefined) {
      process.stdout.write(`\n  ▸ ${testCase.demo}\n`);
    }
    try {
      await testCase.run();
      process.stdout.write(`  ok    ${testCase.name}\n`);
    } catch (error) {
      failures.push(`${testCase.name}: ${error instanceof Error ? error.message : String(error)}`);
      process.stdout.write(`  FAIL  ${testCase.name}\n`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`${String(failures.length)} case(s) failed:\n  - ${failures.join('\n  - ')}`);
  }

  if (DEMO) {
    vscode.window.setStatusBarMessage('$(check)  All green — closing', 4000);
    await beat(3500);
  }

  process.stdout.write(
    `quick-utils works in a real Extension Host (VS Code ${vscode.version}, ${String(selected.length)} cases)\n`
  );
}
