/**
 * Parsing `.quick-utils.json`, and what the store does with the outcome.
 *
 * The file is edited by hand and pulled from branches, so being wrong is its
 * normal state some of the time. Everything here is about what happens then.
 */

import { describe, expect, it } from 'vitest';

import { PresetStore, parsePresets } from '../../src/features/presets';

const file = (snippets: unknown): string => JSON.stringify({ snippets });

describe('parsePresets', () => {
  it('reads a well-formed file', () => {
    const outcome = parsePresets(
      file([
        { name: 'header', body: '// (c) 2026', description: 'Licence header' },
        { name: 'run', body: 'docker run --rm -it app' },
      ])
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.map((preset) => preset.name)).toEqual(['header', 'run']);
      expect(outcome.value[0]?.description).toBe('Licence header');
      expect(outcome.value[1]?.description).toBeUndefined();
    }
  });

  it('accepts an empty list — a file that is there but says nothing yet', () => {
    const outcome = parsePresets(file([]));
    expect(outcome).toEqual({ ok: true, value: [] });
  });

  it('reports a syntax error rather than throwing it', () => {
    const outcome = parsePresets('{ "snippets": [ }');

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toHaveLength(1);
      expect(outcome.error[0]).toBeTypeOf('string');
    }
  });

  it('names every field that is wrong, not just the first', () => {
    const outcome = parsePresets(file([{ name: '', body: 1 }, { body: 'x' }]));

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      // Someone fixing this file is looking at all of it; one mistake per save
      // would waste their afternoon.
      expect(outcome.error.length).toBeGreaterThan(1);
    }
  });

  it('rejects duplicate names, which the schema alone would not', () => {
    const outcome = parsePresets(
      file([
        { name: 'same', body: 'first' },
        { name: 'same', body: 'second' },
      ])
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      // Two valid objects, one ambiguous picker. Keeping whichever came last is
      // the kind of thing that gets blamed on the picker. The index says which
      // entry to delete.
      expect(outcome.error).toEqual(['snippets[1]: duplicate snippet name "same"']);
    }
  });

  it('rejects a file that is valid JSON but not this shape', () => {
    expect(parsePresets('[]').ok).toBe(false);
    expect(parsePresets('"snippets"').ok).toBe(false);
    expect(parsePresets('null').ok).toBe(false);
  });
});

describe('PresetStore', () => {
  it('starts empty and knows it has loaded nothing', () => {
    const store = new PresetStore();

    expect(store.presets).toEqual([]);
    expect(store.issues).toEqual([]);
    expect(store.loadedFrom).toBeUndefined();
  });

  it('takes a successful load, and forgets earlier issues', () => {
    const store = new PresetStore();
    store.apply('file:///a', parsePresets('nonsense'));
    expect(store.issues).not.toEqual([]);

    store.apply('file:///a', parsePresets(file([{ name: 'x', body: 'y' }])));

    expect(store.presets.map((preset) => preset.name)).toEqual(['x']);
    expect(store.issues).toEqual([]);
    expect(store.loadedFrom).toBe('file:///a');
  });

  it('keeps the last good set when a load fails', () => {
    const store = new PresetStore();
    store.apply('file:///a', parsePresets(file([{ name: 'x', body: 'y' }])));

    store.apply('file:///a', parsePresets('{ broken'));

    // The file is mid-edit. Dropping working snippets at the first unbalanced
    // brace would make every save a hazard.
    expect(store.presets.map((preset) => preset.name)).toEqual(['x']);
    expect(store.issues).not.toEqual([]);
    expect(store.loadedFrom).toBe('file:///a');
  });

  it('clears completely for a workspace with no preset file', () => {
    const store = new PresetStore();
    store.apply('file:///a', parsePresets(file([{ name: 'x', body: 'y' }])));

    store.clear();

    expect(store.presets).toEqual([]);
    expect(store.issues).toEqual([]);
    expect(store.loadedFrom).toBeUndefined();
  });
});
