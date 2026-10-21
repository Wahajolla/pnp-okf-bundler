import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { slugify, kebab, typeDir, DEFAULT_TYPES, resolveType, resolveLink } from '../skills/kb/kb.mjs';
import { kb, tmpProject, initProject, read, has, entry } from './helpers.mjs';

const cfg = { types: DEFAULT_TYPES };

test('slugify', () => {
  assert.equal(slugify('Use pnpm workspaces!'), 'use-pnpm-workspaces');
  assert.equal(slugify('Café déjà vu'), 'cafe-deja-vu');
  const long = slugify('word '.repeat(30));
  assert.ok(long.length <= 60 && !long.endsWith('-'));
  assert.match(slugify('日本語'), /^entry-[0-9a-f]{6}$/);
});

test('type folders', () => {
  assert.equal(typeDir('Decision', cfg), 'decisions');
  assert.equal(typeDir('How-To', cfg), 'how-tos');
  assert.equal(typeDir('Bug Report', cfg), 'bug-reports');
  assert.equal(typeDir('X', { types: { X: { dir: 'custom' } } }), 'custom');
  assert.equal(kebab('BigQuery Table'), 'bigquery-table');
  assert.deepEqual(resolveType('decision', cfg), { name: 'Decision', known: true });
  assert.deepEqual(resolveType('Bug', cfg), { name: 'Bug', known: false });
});

test('resolveLink', () => {
  assert.deepEqual(resolveLink('gotchas/a.md', '/decisions/x.md'), { rel: 'decisions/x.md', hash: '', absolute: true });
  assert.deepEqual(resolveLink('gotchas/a.md', '../decisions/x.md#h'), { rel: 'decisions/x.md', hash: '#h', absolute: false });
  assert.equal(resolveLink('gotchas/a.md', 'https://x.y/z.md'), null);
  assert.equal(resolveLink('gotchas/a.md', '../../outside.md'), null);
});

test('init creates config and root index; is idempotent', () => {
  const dir = tmpProject();
  const r = kb(dir, ['init']);
  assert.equal(r.code, 0);
  assert.equal(r.out, 'created .knowledge/kb.config.json\ncreated .knowledge/index.md');
  assert.deepEqual(Object.keys(JSON.parse(read(dir, 'kb.config.json')).types), ['Decision', 'Gotcha', 'How-To', 'Fact', 'Overview']);
  assert.equal(read(dir, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# Types\n');
  const again = kb(dir, ['init']);
  assert.equal(again.out, 'reindexed 0 entries in 0 folders');
});

test('discovery walks up; missing bundle exits 2', () => {
  const dir = initProject();
  const sub = path.join(dir, 'a', 'b');
  fs.mkdirSync(sub, { recursive: true });
  assert.equal(kb(sub, ['types']).code, 0);
  const none = tmpProject();
  const r = kb(none, ['types']);
  assert.equal(r.code, 2);
  assert.match(r.err, /^error: no \.knowledge\/ found from .* — run \/setup-kb$/);
  assert.equal(kb(none, ['types', '--root', dir]).code, 0);
  assert.equal(kb(none, ['types'], undefined, { KB_ROOT: path.join(dir, '.knowledge') }).code, 0);
});

test('types output', () => {
  const dir = initProject();
  const r = kb(dir, ['types']);
  assert.equal(r.out.split('\n')[0], 'Decision — A choice made and why  [Context, Decision, Consequences]');
  assert.equal(r.out.split('\n')[3], 'Fact — A stable truth about the project');
});

test('index.md regeneration is deterministic and sorted', () => {
  const dir = initProject();
  kb(dir, ['add'], [
    entry({ type: 'decision', title: 'Zebra choice', description: 'Z.' }),
    entry({ type: 'Decision', title: 'alpha choice', description: 'A.', extra: 'status: deprecated\n' }),
    entry({ type: 'Bug', title: 'Weird bug', description: 'B.' }),
  ].join('=== kb:entry ===\n'));
  assert.equal(read(dir, 'decisions/index.md'), '# Decision\n\n* [alpha choice](alpha-choice.md) - A. (deprecated)\n* [Zebra choice](zebra-choice.md) - Z.\n');
  assert.equal(read(dir, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# Types\n\n* [Decision](decisions/index.md) - A choice made and why\n* [Bug](bugs/index.md)\n');
  const before = fs.statSync(path.join(dir, '.knowledge/index.md')).mtimeMs;
  kb(dir, ['reindex']);
  assert.equal(fs.statSync(path.join(dir, '.knowledge/index.md')).mtimeMs, before);
  kb(dir, ['delete', 'weird-bug']);
  assert.ok(!has(dir, 'bugs'));
  assert.doesNotMatch(read(dir, 'index.md'), /Bug/);
});
