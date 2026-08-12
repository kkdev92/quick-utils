/**
 * VSIX verification.
 *
 * Extracts the packaged VSIX and checks four things:
 *
 * 1. Everything the extension needs at runtime is present (both bundles, the
 *    webview assets, l10n bundles, manifest strings, icons).
 * 2. Nothing that must not ship is present (sources, tests, scripts,
 *    node_modules, source maps, the local `.env`).
 * 3. The bundles pull in no networking module, which is what makes the
 *    "no network requests" claim in README/SECURITY checkable rather than
 *    asserted.
 * 4. The packaged regex worker actually works: a normal pattern returns the
 *    matches it should, and a catastrophically backtracking one is killed by
 *    `terminate()` instead of wedging the caller. That second case is the whole
 *    reason the worker exists, so it is verified on every package.
 *
 * Usage: node scripts/verify-vsix.mjs [path-to.vsix]
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const projectRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const extractDir = join(projectRoot, '.vsix-verify-temp');

const REQUIRED = [
  'extension/package.json',
  'extension/package.nls.json',
  'extension/package.nls.ja.json',
  'extension/readme.md',
  'extension/LICENSE.txt',
  'extension/changelog.md',
  'extension/THIRD_PARTY_NOTICES.md',
  'extension/dist/extension.js',
  'extension/dist/regex-worker.js',
  'extension/dist/webview/regex-tester.js',
  'extension/dist/webview/scratchpad.js',
  'extension/l10n/bundle.l10n.json',
  'extension/l10n/bundle.l10n.ja.json',
  'extension/media/icon.png',
  'extension/media/icon.svg',
  'extension/media/webview/regex-tester.html',
  'extension/media/webview/regex-tester.css',
  'extension/media/webview/scratchpad.css',
];

const FORBIDDEN = [
  'extension/src',
  'extension/test',
  'extension/scripts',
  'extension/node_modules',
  'extension/work',
  'extension/.env',
  'extension/.mcp.json',
  'extension/dist/extension.js.map',
  'extension/dist/regex-worker.js.map',
  'extension/dist/webview/regex-tester.js.map',
  'extension/dist/webview/scratchpad.js.map',
];

/**
 * Node modules that would give the extension a way onto the network. None are
 * imported, so none should appear as a `require` in either bundle.
 */
const NETWORK_MODULES = ['http', 'https', 'net', 'tls', 'dns', 'http2', 'dgram'];

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function findVsix() {
  const fromArg = process.argv[2];
  if (fromArg !== undefined) {
    return resolve(fromArg);
  }
  const files = readdirSync(projectRoot).filter((file) => file.endsWith('.vsix'));
  if (files.length === 0) {
    throw new Error('No .vsix found. Run `npm run package` first.');
  }
  return join(projectRoot, files[0]);
}

function extract(vsixPath) {
  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });

  // A VSIX is a zip archive. On Windows use the System32 bsdtar by absolute
  // path (a GNU tar earlier in PATH — e.g. from Git Bash — cannot read zip); on
  // POSIX use unzip. Relative paths avoid bsdtar misparsing `C:\…` as a remote.
  const localCopy = join(extractDir, 'package.vsix.zip');
  copyFileSync(vsixPath, localCopy);
  // Spawned with an argv array rather than a shell string, so the archiver's path
  // is an argument instead of a word to be parsed. `SystemRoot` is a trusted value
  // — anyone who can set it can already run anything — but as argv there is no
  // quoting to get right and no shell to get it wrong.
  const [command, args] =
    process.platform === 'win32'
      ? [
          join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'),
          ['-xf', 'package.vsix.zip'],
        ]
      : ['unzip', ['-q', 'package.vsix.zip']];
  execFileSync(command, args, { cwd: extractDir, stdio: 'inherit' });
  rmSync(localCopy);
}

function checkFiles() {
  for (const file of REQUIRED) {
    if (existsSync(join(extractDir, file))) {
      ok(`present: ${file}`);
    } else {
      fail(`missing: ${file}`);
    }
  }
  for (const file of FORBIDDEN) {
    if (existsSync(join(extractDir, file))) {
      fail(`must not ship: ${file}`);
    } else {
      ok(`absent:  ${file}`);
    }
  }
}

/**
 * Every string the manifest references with `%key%` must exist in both
 * `package.nls.json` files — a missing key renders as the raw `%key%` in the UI,
 * which is the kind of thing nobody notices until it is published.
 */
function checkManifestStrings() {
  const manifest = readFileSync(join(extractDir, 'extension/package.json'), 'utf8');
  const keys = new Set(
    [...manifest.matchAll(/"%([^%"]+)%"/g)].map((match) => match[1])
  );

  for (const file of ['package.nls.json', 'package.nls.ja.json']) {
    const strings = JSON.parse(readFileSync(join(extractDir, `extension/${file}`), 'utf8'));
    const missing = [...keys].filter((key) => !(key in strings));
    if (missing.length > 0) {
      fail(`${file} is missing ${missing.length} key(s): ${missing.join(', ')}`);
    } else {
      ok(`${file} defines all ${keys.size} manifest strings`);
    }
  }
}

/**
 * The Japanese bundle must translate every English message. A missing key falls
 * back to English silently, so this is the only thing that catches it.
 */
function checkL10nBundles() {
  const base = JSON.parse(readFileSync(join(extractDir, 'extension/l10n/bundle.l10n.json'), 'utf8'));
  const ja = JSON.parse(
    readFileSync(join(extractDir, 'extension/l10n/bundle.l10n.ja.json'), 'utf8')
  );

  const missing = Object.keys(base).filter((key) => !(key in ja));
  const extra = Object.keys(ja).filter((key) => !(key in base));

  if (missing.length > 0) {
    fail(`bundle.l10n.ja.json is missing ${missing.length} message(s): ${missing.slice(0, 5).join(' | ')}`);
  } else {
    ok(`bundle.l10n.ja.json translates all ${Object.keys(base).length} messages`);
  }
  if (extra.length > 0) {
    fail(`bundle.l10n.ja.json has ${extra.length} stale message(s): ${extra.slice(0, 5).join(' | ')}`);
  }
}

function checkNoNetworkModules() {
  for (const bundle of ['extension.js', 'regex-worker.js']) {
    const source = readFileSync(join(extractDir, `extension/dist/${bundle}`), 'utf8');
    const found = NETWORK_MODULES.filter((name) =>
      new RegExp(`require\\((["'])(?:node:)?${name}\\1\\)`).test(source)
    );
    if (found.length > 0) {
      fail(`${bundle} requires networking module(s): ${found.join(', ')}`);
    } else {
      ok(`no networking modules in ${bundle}`);
    }
  }
}

/** Sends one request to the packaged worker and resolves with its reply. */
function ask(worker, request, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      rejectPromise(new Error('timeout'));
    }, timeoutMs);
    worker.once('message', (message) => {
      clearTimeout(timer);
      resolvePromise(message);
    });
    worker.once('error', (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
    worker.postMessage(request);
  });
}

async function regexSmoke() {
  const workerPath = join(extractDir, 'extension/dist/regex-worker.js');

  // 1. A normal pattern, including non-ASCII input, survives packaging.
  const worker = new Worker(workerPath);
  try {
    const response = await ask(
      worker,
      { id: 1, pattern: '(\\p{Script=Han}+)', flags: 'gu', input: '注文 123 明細 456', limit: 10 },
      10_000
    );
    if (response.ok === true && response.matches.length === 2 && response.matches[0].text === '注文') {
      ok('packaged worker matches a Unicode property pattern');
    } else {
      fail(`packaged worker returned unexpected output: ${JSON.stringify(response)}`);
    }
  } catch (error) {
    fail(`packaged worker failed to match: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await worker.terminate();
  }

  // 2. A catastrophically backtracking pattern must not settle — and terminate()
  //    must still be able to stop it. This is the property the whole worker
  //    design exists for.
  const hostile = new Worker(workerPath);
  const started = Date.now();
  try {
    await ask(
      hostile,
      { id: 2, pattern: '(a+)+$', flags: '', input: `${'a'.repeat(40)}b`, limit: 10 },
      1500
    );
    fail('a catastrophic pattern returned instead of running long enough to need a timeout');
  } catch (error) {
    if (error instanceof Error && error.message === 'timeout') {
      ok('catastrophic pattern did not settle within its budget, as expected');
    } else {
      fail(`unexpected worker error: ${error instanceof Error ? error.message : String(error)}`);
    }
  } finally {
    await hostile.terminate();
    const elapsed = Date.now() - started;
    if (elapsed > 20_000) {
      fail(`terminate() took ${elapsed}ms — the worker did not stop promptly`);
    } else {
      ok(`terminate() stopped the wedged worker (${elapsed}ms total)`);
    }
  }
}

const vsixPath = findVsix();
console.log(`Verifying ${vsixPath}`);
extract(vsixPath);
checkFiles();
checkManifestStrings();
checkL10nBundles();
checkNoNetworkModules();
await regexSmoke();
rmSync(extractDir, { recursive: true, force: true });

if (process.exitCode === 1) {
  console.error('\nVSIX verification FAILED');
} else {
  console.log('\nVSIX verification passed');
}
