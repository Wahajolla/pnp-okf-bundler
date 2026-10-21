import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseDoc } from '../skills/kb/kb.mjs';
import { kb, initProject, read, has, entry, NOW } from './helpers.mjs';

test('add writes a canonical entry with managed keys', () => {
  const dir = initProject();
  const r = kb(dir, ['add', '--by', 'claude-code/opus-5.5'], entry({
    type: 'gotcha', title: 'vi.mock hoisting breaks ESM imports', description: "vi.mock is hoisted above imports.",
    extra: 'custom: keep\ntags: [vitest]\nstatus: stable\n', body: 'Use vi.hoisted().',
  }));
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, 'added gotchas/vi-mock-hoisting-breaks-esm-imports.md');
  assert.equal(read(dir, 'gotchas/vi-mock-hoisting-breaks-esm-imports.md'), [
    '---',
    'type: Gotcha',
    'title: vi.mock hoisting breaks ESM imports',
    'description: vi.mock is hoisted above imports.',
    'tags: [vitest]',
    'custom: keep',
    'generated:',
    '  by: claude-code/opus-5.5',
    '  at: 2026-10-21T12:00:00+00:00',
    'kb_created: 2026-10-21T12:00:00+00:00',
    '---',
    '',
    'Use vi.hoisted().',
    '',
  ].join('\n'));
});

test('add batch: failures do not stop others; exit 1; warnings', () => {
  const dir = initProject();
  kb(dir, ['add'], entry({ title: 'Existing one' }));
  const r = kb(dir, ['add'], [
    entry({ title: 'Existing one' }),
    '---\ntype: Fact\ntitle: No desc\n---\nx\n',
    entry({ type: 'Bug', title: 'Odd thing' }),
    'no frontmatter at all\n',
    entry({ title: 'Fine one' }),
  ].join('=== kb:entry ===\n'));
  assert.equal(r.code, 1);
  assert.equal(r.out, 'added bugs/odd-thing.md\nadded facts/fine-one.md');
  const errs = r.err.split('\n');
  assert.equal(errs[0], `exists: entry 1 "Existing one" → facts/existing-one.md — use 'kb update' or pick a different title`);
  assert.equal(errs[1], 'error: entry 2 "No desc" missing required description');
  assert.equal(errs[2], 'warn: entry 3 "Odd thing" unknown type "Bug" — known: Decision, Gotcha, How-To, Fact, Overview');
  assert.match(errs[3], /^error: entry 4 has no frontmatter/);
});

test('add: empty stdin is a usage error', () => {
  const dir = initProject();
  assert.equal(kb(dir, ['add'], '').code, 2);
});

test('add warns similar: (same type, title overlap or same resource) but writes', () => {
  const dir = initProject();
  kb(dir, ['add'], entry({ type: 'Gotcha', title: 'Vitest ESM mock hoisting', extra: 'resource: src/a.ts\n' }));
  const r = kb(dir, ['add'], [
    entry({ type: 'Gotcha', title: 'ESM mocks hoisting in Vitest' }),
    entry({ type: 'Fact', title: 'Vitest ESM mock hoisting rule' }),
    entry({ type: 'Gotcha', title: 'Totally different', extra: 'resource: src/a.ts\n' }),
  ].join('=== kb:entry ===\n'));
  assert.equal(r.code, 0);
  assert.equal(r.out.split('\n').length, 3);
  const sims = r.err.split('\n').filter((l) => l.startsWith('similar:'));
  assert.deepEqual(sims, [
    `similar: entry 1 "ESM mocks hoisting in Vitest" ~ gotchas/vitest-esm-mock-hoisting.md — merge with 'kb update' + 'kb delete' if same topic`,
    `similar: entry 3 "Totally different" ~ gotchas/vitest-esm-mock-hoisting.md — merge with 'kb update' + 'kb delete' if same topic`,
  ]);
});

test('update patches keys, removes with null, keeps unknown keys, refreshes generated.at, keeps kb_created', () => {
  const dir = initProject();
  kb(dir, ['add'], entry({ title: 'A fact', extra: 'tags: [a]\nweird_key:   {x: 1}\n' }), { KB_NOW: '2026-01-01T00:00:00Z' });
  const r = kb(dir, ['update', 'a-fact'], '---\ntags: [b, c]\nstatus: draft\nweird_key: null\n---\n');
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, 'updated facts/a-fact.md');
  const d = parseDoc(read(dir, 'facts/a-fact.md')).data;
  assert.deepEqual(d.tags, ['b', 'c']);
  assert.equal(d.status, 'draft');
  assert.ok(!('weird_key' in d));
  assert.equal(d.generated.at, '2026-10-21T12:00:00+00:00');
  assert.equal(d.kb_created, '2026-01-01T00:00:00+00:00');
  assert.match(read(dir, 'facts/a-fact.md'), /\nBody text.\n$/);
  const body = kb(dir, ['update', 'facts/a-fact'], 'New body only.');
  assert.equal(body.code, 0);
  assert.match(read(dir, 'facts/a-fact.md'), /---\n\nNew body only.\n$/);
  assert.deepEqual(parseDoc(read(dir, 'facts/a-fact.md')).data.tags, ['b', 'c']);
});

test('update refuses removing required keys; usage errors', () => {
  const dir = initProject();
  kb(dir, ['add'], entry({ title: 'A fact' }));
  const r = kb(dir, ['update', 'a-fact'], '---\ndescription: null\n---\n');
  assert.equal(r.code, 1);
  assert.equal(r.err, 'error: facts/a-fact.md cannot remove required key "description"');
  assert.equal(kb(dir, ['update', 'a-fact'], '').code, 2);
  assert.equal(kb(dir, ['update', 'nope'], 'x').err, "not-found: nope — check the path, or 'kb find' it");
});

test('type change moves the file and rewrites inbound links (absolute and relative)', () => {
  const dir = initProject();
  kb(dir, ['add'], [
    entry({ title: 'Target', body: 'See [other](/facts/linker.md).' }),
    entry({ title: 'Linker', body: 'Abs [t](/facts/target.md) and rel [t2](target.md#sec) and [ext](https://x.y/target.md).' }),
    entry({ type: 'Gotcha', title: 'Far', body: 'Rel [t](../facts/target.md).\n```\n[code](/facts/target.md)\n```' }),
  ].join('=== kb:entry ===\n'));
  const r = kb(dir, ['update', 'target'], '---\ntype: Decision\n---\n');
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, 'moved facts/target.md -> decisions/target.md\nrelinked facts/linker.md\nrelinked gotchas/far.md');
  assert.ok(!has(dir, 'facts/target.md'));
  assert.match(read(dir, 'decisions/target.md'), /See \[other\]\(\/facts\/linker.md\)/);
  assert.match(read(dir, 'facts/linker.md'), /Abs \[t\]\(\/decisions\/target.md\) and rel \[t2\]\(\.\.\/decisions\/target.md#sec\) and \[ext\]\(https:\/\/x.y\/target.md\)/);
  assert.match(read(dir, 'gotchas/far.md'), /Rel \[t\]\(\.\.\/decisions\/target.md\)\.\n```\n\[code\]\(\/facts\/target.md\)\n```/);
});

test('--reslug renames; moved file keeps its relative links valid', () => {
  const dir = initProject();
  kb(dir, ['add'], [entry({ title: 'Old name', body: 'Link [x](other.md).' }), entry({ title: 'Other' })].join('=== kb:entry ===\n'));
  kb(dir, ['update', 'old-name'], '---\ntitle: New name\n---\n');
  assert.ok(has(dir, 'facts/old-name.md'), 'title change alone must not rename');
  const r = kb(dir, ['update', 'old-name', '--reslug'], '');
  assert.equal(r.out, 'moved facts/old-name.md -> facts/new-name.md');
  const collide = kb(dir, ['update', 'new-name', '--reslug'], '---\ntitle: Other\n---\n');
  assert.equal(collide.code, 1);
  assert.match(collide.err, /^exists: facts\/new-name.md → facts\/other.md/);
});

test('delete unlinks inbound links; reports per address; ambiguous slug', () => {
  const dir = initProject();
  kb(dir, ['add'], [
    entry({ title: 'Gone' }),
    entry({ title: 'Stays', body: 'Ref [the gone one](/facts/gone.md) here.' }),
    entry({ type: 'Gotcha', title: 'Stays' }),
  ].join('=== kb:entry ===\n'));
  const amb = kb(dir, ['delete', 'stays']);
  assert.equal(amb.code, 1);
  assert.equal(amb.err, 'ambiguous: stays — candidates: facts/stays.md, gotchas/stays.md');
  const r = kb(dir, ['delete', '/facts/gone.md', 'missing']);
  assert.equal(r.code, 1);
  assert.equal(r.out, 'deleted facts/gone.md\nunlinked facts/stays.md');
  assert.match(read(dir, 'facts/stays.md'), /Ref the gone one here\./);
});

test('reindex reports problems without failing', () => {
  const dir = initProject();
  kb(dir, ['add'], entry({ title: 'Has broken', body: '[x](/facts/nope.md)', extra: 'stale_after: 2026-01-01T00:00:00Z\n' }));
  fs.writeFileSync(path.join(dir, '.knowledge/facts/bad.md'), '---\ntype: [unclosed\n---\n');
  fs.writeFileSync(path.join(dir, '.knowledge/facts/notitle.md'), '---\ntype: Fact\n---\n');
  const r = kb(dir, ['reindex']);
  assert.equal(r.code, 0);
  assert.equal(r.out, 'reindexed 2 entries in 1 folders');
  assert.match(r.err, /warn: facts\/bad.md unparseable frontmatter/);
  assert.match(r.err, /warn: facts\/has-broken.md broken link -> \/facts\/nope.md/);
  assert.match(r.err, /warn: facts\/notitle.md missing title, description/);
  assert.match(r.err, /stale: facts\/has-broken.md \(since 2026-01-01\)/);
});

test('--json for writes', () => {
  const dir = initProject();
  const r = kb(dir, ['add', '--json'], entry({ title: 'J' }));
  assert.deepEqual(JSON.parse(r.out), [{ op: 'added', path: 'facts/j.md' }]);
});

test('real CLI: version, help, usage exit codes, heredoc stdin', () => {
  const dir = initProject();
  const bin = path.resolve('skills/kb/kb.mjs');
  const env = { ...process.env, KB_NOW: NOW, TZ: 'UTC' };
  const v = spawnSync('node', [bin, '--version'], { encoding: 'utf8' });
  assert.equal(v.stdout.trim(), '1.0.0');
  assert.equal(spawnSync('node', [bin, 'bogus'], { cwd: dir, encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync('node', [bin, 'find', '--wat'], { cwd: dir, encoding: 'utf8' }).status, 2);
  const a = spawnSync('node', [bin, 'add'], { cwd: dir, env, input: entry({ title: 'From pipe' }), encoding: 'utf8' });
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.stdout, 'added facts/from-pipe.md\n');
  const f = spawnSync('node', [bin, 'find', 'pipe'], { cwd: dir, env, encoding: 'utf8' });
  assert.match(f.stdout, /^facts\/from-pipe.md  \[Fact\] From pipe  · 2026-10-21\n/);
});
