import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, parseDoc, serializeDoc } from '../skills/kb/kb.mjs';

test('scalars: plain, quoted, typed', () => {
  const y = parseYaml([
    'a: plain text',
    'b: "double: quoted \\"x\\""',
    "c: 'single ''q'''",
    'd: 42',
    'e: true',
    'f: null',
    'g: ~',
    'h: 2026-10-21T14:05:00+03:00',
    'i: value # comment',
    'j: "0.2"',
  ].join('\n'));
  assert.deepEqual(y, {
    a: 'plain text', b: 'double: quoted "x"', c: "single 'q'", d: 42, e: true,
    f: null, g: null, h: '2026-10-21T14:05:00+03:00', i: 'value', j: '0.2',
  });
});

test('flow and block lists, flow and block maps, lists of maps', () => {
  const y = parseYaml([
    'tags: [vitest, "es m", testing]',
    'list:',
    '  - one',
    '  - two',
    'flat:',
    '- x',
    '- y',
    'generated: { by: kb/1.0.0, at: 2026-10-21T14:05:00+03:00 }',
    'nested:',
    '  by: human:anna',
    '  at: 2026-01-01T00:00:00Z',
    'sources:',
    '  - resource: src/a.ts',
    '    id: s1',
    '  - { resource: "https://x.y/z?a=1" }',
    'verified:',
    '  - by: human:a',
    '    at: 2026-01-01T00:00:00Z',
    'empty: []',
    'emap: {}',
  ].join('\n'));
  assert.deepEqual(y.tags, ['vitest', 'es m', 'testing']);
  assert.deepEqual(y.list, ['one', 'two']);
  assert.deepEqual(y.flat, ['x', 'y']);
  assert.deepEqual(y.generated, { by: 'kb/1.0.0', at: '2026-10-21T14:05:00+03:00' });
  assert.deepEqual(y.nested, { by: 'human:anna', at: '2026-01-01T00:00:00Z' });
  assert.deepEqual(y.sources, [{ resource: 'src/a.ts', id: 's1' }, { resource: 'https://x.y/z?a=1' }]);
  assert.deepEqual(y.verified, [{ by: 'human:a', at: '2026-01-01T00:00:00Z' }]);
  assert.deepEqual(y.empty, []);
  assert.deepEqual(y.emap, {});
});

test('block scalars and comments', () => {
  const y = parseYaml([
    '# leading comment',
    'lit: |',
    '  line one',
    '  line two',
    'fold: >',
    '  folded',
    '  text',
    'after: ok',
  ].join('\n'));
  assert.equal(y.lit, 'line one\nline two\n');
  assert.equal(y.fold, 'folded text\n');
  assert.equal(y.after, 'ok');
});

test('invalid yaml throws', () => {
  assert.throws(() => parseYaml('just a line without colon'));
  assert.throws(() => parseYaml('a: [unclosed'));
});

test('parseDoc splits frontmatter and body', () => {
  const d = parseDoc('---\ntype: Fact\ntitle: T\n---\n\nBody here.\n');
  assert.deepEqual(d.data, { type: 'Fact', title: 'T' });
  assert.equal(d.body, '\nBody here.\n');
  const nofm = parseDoc('Only body');
  assert.equal(nofm.data, null);
  assert.equal(nofm.body, 'Only body');
  assert.throws(() => parseDoc('---\ntype: x\nno end'));
});

test('round-trip preserves untouched keys byte-for-byte and order', () => {
  const src = [
    '---',
    'type: Fact',
    'custom_x:   {a: 1,  b: [x,y]}   # keep me',
    'title: Old',
    'odd: |',
    '  keep',
    '  this',
    '---',
    'body',
    '',
  ].join('\n');
  const d = parseDoc(src);
  assert.equal(serializeDoc(d), src);
  d.data.title = 'New: with colon';
  d.data.added = ['a', 'b'];
  delete d.data.odd;
  const out = serializeDoc(d);
  assert.equal(out, [
    '---',
    'type: Fact',
    'custom_x:   {a: 1,  b: [x,y]}   # keep me',
    'title: "New: with colon"',
    'added: [a, b]',
    '---',
    'body',
    '',
  ].join('\n'));
  assert.deepEqual(parseDoc(out).data, { type: 'Fact', custom_x: { a: 1, b: ['x', 'y'] }, title: 'New: with colon', added: ['a', 'b'] });
});

test('serializer output re-parses to the same data', () => {
  const data = {
    type: 'How-To', title: "it's: tricky #1", description: 'true', tags: ['a b', 'c'],
    sources: [{ resource: 'src/x.ts', id: 'n1' }, { resource: 'https://e.com/a#b' }],
    generated: { by: 'kb/1.0.0', at: '2026-10-21T14:05:00+03:00' }, n: 3, multi: 'a\nb', empty: [], s: '- dash',
  };
  const d = { data, body: 'x\n' };
  assert.deepEqual(parseDoc(serializeDoc(d)).data, data);
});
