import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, queryTokens, stem } from '../skills/kb/kb.mjs';
import { kb, initProject } from './helpers.mjs';
import { FIXTURE } from './fixtures/entries.mjs';

let dir;
before(() => {
  dir = initProject();
  const r = kb(dir, ['add'], FIXTURE.join('=== kb:entry ===\n'));
  assert.equal(r.code, 0, r.err);
});
const paths = (r) => r.out.split('\n').filter((l) => /^\S+\.md  \[/.test(l)).map((l) => l.split('  ')[0]);

test('tokenizer: compounds, parts, camelCase, acronyms, digits, stopwords, diacritics', () => {
  assert.deepEqual(tokenize('vi.mock'), ['vi.mock', 'vi', 'mock']);
  assert.deepEqual(tokenize('parseJSONFile'), ['parsejsonfile', 'pars', 'json', 'fil']);
  assert.deepEqual(tokenize('XMLHttpRequest'), ['xmlhttprequest', 'xml', 'http', 'request']);
  assert.deepEqual(tokenize('utf8'), ['utf8', 'utf', '8']);
  assert.deepEqual(tokenize('path_to_file'), ['path_to_file', 'path', 'fil']);
  assert.deepEqual(tokenize('src/utils/foo.ts'), ['src/utils/foo.ts', 'src', 'util', 'foo', 'ts']);
  assert.deepEqual(tokenize('The café is closing.'), ['caf', 'clos']);
  assert.deepEqual(tokenize('a b 7'), ['7']);
  assert.deepEqual(queryTokens('how do I'), ['how', 'do']);
});

test('stemmer', () => {
  for (const [a, b] of [['mocks', 'mock'], ['mocking', 'mock'], ['mocked', 'mock'], ['hoisting', 'hoist'], ['caches', 'cach'], ['cache', 'cach'],
    ['libraries', 'library'], ['stopped', 'stop'], ['running', 'run'], ['falling', 'fall'], ['status', 'status'], ['process', 'process'], ['quickly', 'quick']]) {
    assert.equal(stem(a), b, a);
  }
});

test('find ranks the obvious entry first', () => {
  const cases = [
    ['vi.mock hoisting', 'gotchas/vi-mock-hoisting-breaks-esm-imports.md'],
    ['mockFetch ReferenceError', 'gotchas/vi-mock-hoisting-breaks-esm-imports.md'],
    ['refresh token', 'gotchas/refresh-token-race-on-parallel-requests.md'],
    ['how does login work', 'overviews/authentication-flow.md'],
    ['parseJSONFile', 'gotchas/parsejsonfile-swallows-syntax-errors.md'],
    ['parse json', 'gotchas/parsejsonfile-swallows-syntax-errors.md'],
    ['shadow database permission', 'gotchas/prisma-migrate-fails-on-shadow-database-permissions.md'],
    ['pnpm install monorepo', 'decisions/use-pnpm-workspaces-for-the-monorepo.md'],
    ['request validation', 'decisions/adopt-zod-for-request-validation.md'],
    ['cafe accents', 'gotchas/cafe-names-with-accents-fail-search.md'],
    ['src/utils/parseJSONFile.ts', 'gotchas/parsejsonfile-swallows-syntax-errors.md'],
    ['releasing', 'how-tos/release-a-new-version.md'],
  ];
  for (const [q, want] of cases) {
    const r = kb(dir, ['find', ...q.split(' ')]);
    assert.equal(paths(r)[0], want, `query "${q}":\n${r.out}`);
  }
});

test('hit format: header with markers and date, description, excerpt', () => {
  const r = kb(dir, ['find', 'vi.hoisted']);
  assert.equal(r.out, [
    "gotchas/vi-mock-hoisting-breaks-esm-imports.md  [Gotcha] vi.mock hoisting breaks ESM imports  · 2026-10-21",
    "  vi.mock is hoisted above imports, so factory closures can't reference module vars.",
    '  > Use vi.hoisted() to declare the mock fns, then reference them in the factory.',
  ].join('\n'));
  const stale = kb(dir, ['find', 'node', '22', 'required']);
  assert.match(stale.out, /^facts\/node-22-is-required.md  \[Fact\] Node 22 is required \(stale\)  · 2026-10-21$/m);
  const draft = kb(dir, ['find', 'replay', 'webhook']);
  assert.match(draft.out, /\[How-To\] Debug a failing webhook \(draft\)  · /);
});

test('excerpt picks a second line only for new terms, in body order, and cuts long lines', () => {
  const r = kb(dir, ['find', 'hoists', 'initialization']);
  const ex = r.out.split('\n\n')[0].split('\n').filter((l) => l.startsWith('  > '));
  assert.equal(ex.length, 2);
  assert.match(ex[0], /initialization/);
  assert.match(ex[1], /hoists/);
  for (const l of r.out.split('\n').filter((x) => x.startsWith('  > '))) assert.ok(l.length <= 4 + 162, l);
});

test('deprecated entries are down-ranked below their replacement and marked', () => {
  const r = kb(dir, ['find', 'validation']);
  const p = paths(r);
  assert.ok(p.indexOf('decisions/adopt-zod-for-request-validation.md') < p.indexOf('decisions/use-joi-for-validation.md'), r.out);
  assert.match(r.out, /Use Joi for validation \(deprecated\)/);
});

test('filters: --type OR, --tag AND, -n, unknown type warns', () => {
  const t = kb(dir, ['find', 'stripe', '--type', 'how-to']);
  assert.ok(paths(t).length > 0 && paths(t).every((x) => x.startsWith('how-tos/')), t.out);
  const two = kb(dir, ['find', 'stripe', '--type', 'How-To,Overview']);
  assert.ok(paths(two).some((x) => x.startsWith('overviews/')));
  const tag = kb(dir, ['find', 'database', '--tag', 'prisma', '--tag', 'database']);
  assert.ok(paths(tag).every((x) => /prisma|migration/.test(x)), tag.out);
  assert.equal(paths(kb(dir, ['find', 'database', '-n', '1'])).length, 1);
  const unk = kb(dir, ['find', 'x', '--type', 'Bug']);
  assert.match(unk.err, /^warn: unknown type "Bug" — known:/);
});

test('cutoff drops weak tails; no matches; usage', () => {
  const r = kb(dir, ['find', 'parseJSONFile', '-n', '20']);
  assert.ok(paths(r).length < 5, r.out);
  assert.equal(kb(dir, ['find', 'zzzqqq']).out, 'no matches for "zzzqqq"');
  const u = kb(dir, ['find']);
  assert.equal(u.code, 2);
  assert.match(u.err, /index\.md/);
});

test('--json hits carry score, tags, timestamps', () => {
  const r = kb(dir, ['find', 'stripe', '--json']);
  const hits = JSON.parse(r.out);
  assert.ok(hits.length > 0);
  for (const k of ['path', 'type', 'title', 'description', 'status', 'stale', 'tags', 'score', 'generated', 'kb_created', 'excerpt']) assert.ok(k in hits[0], k);
});
