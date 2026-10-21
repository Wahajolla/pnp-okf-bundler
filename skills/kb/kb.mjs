#!/usr/bin/env node
// kb — agent-first local knowledge base over an OKF v0.2 bundle (.knowledge/), searched with BM25.
// Single file, zero dependencies. See SPEC.md in the source repository.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const VERSION = '1.0.0';

const REQUIRED = ['type', 'title', 'description'];
const MANAGED = ['generated', 'kb_created'];
const KEY_ORDER = ['type', 'title', 'description', 'tags', 'resource', 'sources', 'status', 'stale_after'];
const RESERVED = new Set(['index.md', 'log.md']);
const ENTRY_SEP = /^=== kb:entry ===[ \t]*$/;

export const DEFAULT_TYPES = {
  Decision: { description: 'A choice made and why', sections: ['Context', 'Decision', 'Consequences'] },
  Gotcha: { description: 'A trap: symptom → cause → fix', sections: ['Symptom', 'Cause', 'Fix'] },
  'How-To': { description: 'A non-obvious procedure', sections: ['Steps'] },
  Fact: { description: 'A stable truth about the project', sections: [] },
  Overview: { description: 'How a subsystem or flow works: parts, data flow, key invariants', sections: ['Summary', 'Components', 'Flow', 'Invariants'] },
};

// Search constants (SPEC §5).
const WEIGHTS = { title: 3, tags: 2.5, description: 2, resource: 1.5, body: 1 };
const K1 = 1.2;
const B = 0.75;
const CUTOFF = 0.3;
const DEFAULT_LIMIT = 5;
const DEPRECATED_FACTOR = 0.5;
const SIMILAR_JACCARD = 0.6;
const EXCERPT_WIDTH = 160;

export class YamlError extends Error {}
class UsageError extends Error {}

// ───────────────────────────── YAML frontmatter ─────────────────────────────

const isBlankLine = (l) => { const t = l.trim(); return t === '' || t.startsWith('#'); };
const indentOf = (l) => l.match(/^ */)[0].length;
const isSeqItem = (t) => t === '-' || t.startsWith('- ');

function matchKey(t) {
  let m = t.match(/^"((?:[^"\\]|\\.)*)"\s*:(\s+.*|)$/);
  if (m) return { key: JSON.parse(`"${m[1]}"`), rest: m[2] };
  m = t.match(/^'((?:[^']|'')*)'\s*:(\s+.*|)$/);
  if (m) return { key: m[1].replace(/''/g, "'"), rest: m[2] };
  m = t.match(/^([^\s#'"[\]{},:][^:]*?)\s*:(\s+.*|)$/);
  if (m) return { key: m[1], rest: m[2] };
  return null;
}

function typeScalar(s) {
  if (s === '' || s === '~' || /^null$/i.test(s)) return null;
  if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
  if (/^[-+]?\d+$/.test(s)) { const n = Number(s); if (Number.isSafeInteger(n)) return n; }
  if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s);
  return s;
}

function readQuoted(s, i) {
  const q = s[i];
  let j = i + 1;
  let out = '';
  if (q === "'") {
    for (; j < s.length; j++) {
      if (s[j] === "'") {
        if (s[j + 1] === "'") { out += "'"; j++; continue; }
        return { value: out, end: j + 1 };
      }
      out += s[j];
    }
  } else {
    for (; j < s.length; j++) {
      if (s[j] === '\\') { j++; continue; }
      if (s[j] === '"') {
        try { return { value: JSON.parse(s.slice(i, j + 1)), end: j + 1 }; } catch { throw new YamlError(`bad escape in ${s.slice(i, j + 1)}`); }
      }
    }
  }
  throw new YamlError(`unterminated quoted string: ${s.slice(i)}`);
}

function parseFlow(s) {
  let i = 0;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const fail = () => { throw new YamlError(`bad flow collection: ${s}`); };
  function plain(stopAtColon) {
    const start = i;
    while (i < s.length && !',]}'.includes(s[i])) {
      if (stopAtColon && s[i] === ':' && (i + 1 >= s.length || /[\s,\]}]/.test(s[i + 1]))) break;
      i++;
    }
    return s.slice(start, i).trim();
  }
  function value(stopAtColon = false) {
    ws();
    const c = s[i];
    if (c === '[') {
      i++; const arr = []; ws();
      if (s[i] === ']') { i++; return arr; }
      for (;;) {
        arr.push(value()); ws();
        if (s[i] === ',') { i++; ws(); if (s[i] === ']') { i++; return arr; } continue; }
        if (s[i] === ']') { i++; return arr; }
        fail();
      }
    }
    if (c === '{') {
      i++; const obj = {}; ws();
      if (s[i] === '}') { i++; return obj; }
      for (;;) {
        ws();
        let key;
        if (s[i] === '"' || s[i] === "'") { const r = readQuoted(s, i); key = r.value; i = r.end; } else key = plain(true);
        if (!key && key !== '') fail();
        ws();
        let v = null;
        if (s[i] === ':') { i++; v = value(); }
        obj[key] = v; ws();
        if (s[i] === ',') { i++; ws(); if (s[i] === '}') { i++; return obj; } continue; }
        if (s[i] === '}') { i++; return obj; }
        fail();
      }
    }
    if (c === '"' || c === "'") { const r = readQuoted(s, i); i = r.end; return r.value; }
    if (c === undefined) fail();
    return typeScalar(plain(stopAtColon));
  }
  const v = value();
  ws();
  if (i < s.length && s[i] !== '#') fail();
  return v;
}

function flowBalanced(s) {
  let depth = 0; let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\' && q === '"') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === '#' && depth === 0) break;
  }
  return depth <= 0;
}

function parseInlineScalar(s) {
  if (s[0] === '"' || s[0] === "'") {
    const r = readQuoted(s, 0);
    const rest = s.slice(r.end).trim();
    if (rest && !rest.startsWith('#')) throw new YamlError(`unexpected text after quoted string: ${rest}`);
    return r.value;
  }
  const hash = s.search(/\s#/);
  return typeScalar((hash >= 0 ? s.slice(0, hash) : s).trim());
}

function skipBlank(p) { while (p.i < p.lines.length && isBlankLine(p.lines[p.i])) p.i++; }

function parseNode(p, parentIndent) {
  skipBlank(p);
  if (p.i >= p.lines.length) return null;
  const line = p.lines[p.i];
  const ind = indentOf(line);
  if (ind <= parentIndent) return null;
  return isSeqItem(line.slice(ind)) ? parseSeq(p, ind) : parseMap(p, ind);
}

function parseMap(p, ind) {
  const obj = {};
  for (;;) {
    skipBlank(p);
    if (p.i >= p.lines.length) break;
    const line = p.lines[p.i];
    const li = indentOf(line);
    if (li < ind) break;
    if (li > ind) throw new YamlError(`bad indentation: ${line.trim()}`);
    const t = line.slice(li);
    if (isSeqItem(t)) break;
    const m = matchKey(t);
    if (!m) throw new YamlError(`expected "key: value": ${t}`);
    p.i++;
    obj[m.key] = parseValue(p, ind, m.rest);
  }
  return obj;
}

function parseSeq(p, ind) {
  const arr = [];
  for (;;) {
    skipBlank(p);
    if (p.i >= p.lines.length) break;
    const line = p.lines[p.i];
    const li = indentOf(line);
    if (li < ind) break;
    if (li > ind) throw new YamlError(`bad indentation: ${line.trim()}`);
    const t = line.slice(li);
    if (!isSeqItem(t)) break;
    const content = t === '-' ? '' : t.slice(2);
    const trimmed = content.trimStart();
    const off = li + 2 + (content.length - trimmed.length);
    if (trimmed === '' || trimmed.startsWith('#')) { p.i++; arr.push(parseNode(p, ind)); continue; }
    if (!/^['"[{]/.test(trimmed) && matchKey(trimmed)) {
      p.lines[p.i] = ' '.repeat(off) + trimmed;
      arr.push(parseMap(p, off));
      continue;
    }
    p.i++;
    arr.push(parseValue(p, ind, ' ' + trimmed));
  }
  return arr;
}

function parseBlockScalar(p, ind, header) {
  const style = header[0];
  const chomp = header.includes('-') ? 'strip' : header.includes('+') ? 'keep' : 'clip';
  const body = [];
  let blockIndent = -1;
  while (p.i < p.lines.length) {
    const line = p.lines[p.i];
    if (line.trim() === '') { body.push(''); p.i++; continue; }
    const li = indentOf(line);
    if (li <= ind) break;
    if (blockIndent < 0) blockIndent = li;
    if (li < blockIndent) break;
    body.push(line.slice(blockIndent));
    p.i++;
  }
  let trailing = 0;
  while (body.length && body[body.length - 1] === '') { body.pop(); trailing++; }
  let text;
  if (style === '|') text = body.join('\n');
  else {
    text = '';
    for (let k = 0; k < body.length; k++) {
      if (body[k] === '') text += '\n';
      else text += (k > 0 && body[k - 1] !== '' ? ' ' : '') + body[k];
    }
  }
  if (chomp === 'strip' || body.length === 0) return text;
  return text + '\n' + (chomp === 'keep' ? '\n'.repeat(trailing) : '');
}

function parseValue(p, ind, rest) {
  rest = rest.trim();
  if (rest === '' || rest.startsWith('#')) {
    skipBlank(p);
    if (p.i < p.lines.length) {
      const nl = p.lines[p.i];
      const ni = indentOf(nl);
      if (ni > ind) return parseNode(p, ind);
      if (ni === ind && isSeqItem(nl.slice(ni))) return parseSeq(p, ind);
    }
    return null;
  }
  if (/^[|>][+-]?\d*\s*(#.*)?$/.test(rest)) return parseBlockScalar(p, ind, rest);
  if (rest[0] === '[' || rest[0] === '{') {
    let s = rest;
    while (!flowBalanced(s) && p.i < p.lines.length) s += ' ' + p.lines[p.i++].trim();
    return parseFlow(s);
  }
  return parseInlineScalar(rest);
}

function parseBlockLines(lines) {
  const p = { lines: lines.slice(), i: 0 };
  skipBlank(p);
  if (p.i >= p.lines.length) return {};
  const v = parseNode(p, -1);
  skipBlank(p);
  if (p.i < p.lines.length) throw new YamlError(`unexpected: ${p.lines[p.i].trim()}`);
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new YamlError('frontmatter is not a mapping');
  return v;
}

// Split frontmatter into top-level chunks so untouched keys can be written back byte-for-byte.
function splitTop(text) {
  const lines = text.split('\n');
  const keyLines = [];
  lines.forEach((l, i) => { if (indentOf(l) === 0 && !isBlankLine(l) && !isSeqItem(l)) keyLines.push(i); });
  const chunks = [];
  if (keyLines.length === 0) {
    if (lines.some((l) => !isBlankLine(l))) throw new YamlError(`unexpected: ${lines.find((l) => !isBlankLine(l)).trim()}`);
    return chunks;
  }
  const starts = keyLines.map((k, j) => {
    if (j === 0) return 0;
    let s = k;
    while (s - 1 > keyLines[j - 1] && lines[s - 1].trim() === '') s--;
    return s;
  });
  for (let j = 0; j < keyLines.length; j++) {
    const chunkLines = lines.slice(starts[j], j + 1 < keyLines.length ? starts[j + 1] : lines.length);
    const obj = parseBlockLines(chunkLines);
    const keys = Object.keys(obj);
    if (keys.length !== 1) throw new YamlError(`unexpected structure near: ${lines[keyLines[j]].trim()}`);
    chunks.push({ key: keys[0], value: obj[keys[0]], raw: chunkLines.join('\n') });
  }
  return chunks;
}

export function parseYaml(text) {
  const out = {};
  for (const c of splitTop(text)) out[c.key] = c.value;
  return out;
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Parse a markdown doc into { data, body }. data is null when there is no frontmatter. */
export function parseDoc(text) {
  text = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!/^---[ \t]*(\n|$)/.test(text)) return { data: null, body: text };
  const lines = text.split('\n');
  let end = -1;
  for (let i = 1; i < lines.length; i++) if (/^(---|\.\.\.)[ \t]*$/.test(lines[i])) { end = i; break; }
  if (end < 0) throw new YamlError('unterminated frontmatter (no closing ---)');
  const chunks = splitTop(lines.slice(1, end).join('\n'));
  const data = {};
  const raw = new Map();
  const orig = {};
  for (const c of chunks) { data[c.key] = c.value; raw.set(c.key, c.raw); orig[c.key] = clone(c.value); }
  return { data, body: lines.slice(end + 1).join('\n'), raw, orig };
}

function needsQuote(s, flow) {
  if (s === '' || s !== s.trim()) return true;
  if (/[\n\r\t]/.test(s)) return true;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return true;
  if (/: |:$| #/.test(s)) return true;
  if (flow && /[,[\]{}]/.test(s)) return true;
  if (/^(yes|no|on|off)$/i.test(s)) return true;
  return typeScalar(s) !== s;
}

function scalarText(v, flow = false) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  return needsQuote(s, flow) ? JSON.stringify(s) : s;
}

const isScalar = (v) => v === null || typeof v !== 'object';
const keyText = (k) => (/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(k) ? k : JSON.stringify(k));

function flowText(v) {
  if (Array.isArray(v)) return `[${v.map(flowText).join(', ')}]`;
  if (v && typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${keyText(k)}: ${flowText(x)}`).join(', ')}}`;
  return scalarText(v, true);
}

function serializeKV(k, v, indent) {
  const pad = ' '.repeat(indent);
  const head = `${pad}${keyText(k)}:`;
  if (isScalar(v)) return `${head} ${scalarText(v)}`;
  if (Array.isArray(v)) {
    if (v.length === 0) return `${head} []`;
    if (v.every(isScalar)) {
      const f = `${head} ${flowText(v)}`;
      if (f.length <= 100) return f;
    }
    return [head, ...v.map((item) => serializeItem(item, indent + 2))].join('\n');
  }
  if (Object.keys(v).length === 0) return `${head} {}`;
  return [head, ...Object.entries(v).map(([ck, cv]) => serializeKV(ck, cv, indent + 2))].join('\n');
}

function serializeItem(item, indent) {
  const pad = ' '.repeat(indent);
  if (isScalar(item)) return `${pad}- ${scalarText(item)}`;
  if (Array.isArray(item) || Object.keys(item).length === 0) return `${pad}- ${flowText(item)}`;
  const lines = Object.entries(item).map(([k, v]) => serializeKV(k, v, indent + 2));
  lines[0] = `${pad}- ${lines[0].slice(indent + 2)}`;
  return lines.join('\n');
}

/** Serialize { data, body } back to text; keys whose value is unchanged since parse keep their raw text. */
export function serializeDoc(doc) {
  const parts = [];
  for (const [k, v] of Object.entries(doc.data || {})) {
    if (v === undefined) continue;
    if (doc.raw && doc.raw.has(k) && sameValue(v, doc.orig[k])) parts.push(doc.raw.get(k));
    else parts.push(serializeKV(k, v, 0));
  }
  return `---\n${parts.length ? parts.join('\n') + '\n' : ''}---\n${doc.body}`;
}

// ───────────────────────────── helpers ─────────────────────────────

const fold = (s) => s.normalize('NFKD').replace(/\p{M}+/gu, '');
const str = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const asList = (v) => (v === null || v === undefined ? [] : Array.isArray(v) ? v : [v]);
const posix = path.posix;

export function nowIso(env = process.env) {
  const d = env.KB_NOW ? new Date(env.KB_NOW) : new Date();
  const off = -d.getTimezoneOffset();
  const p2 = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const local = new Date(d.getTime() + off * 60000);
  const base = local.toISOString().slice(0, 19);
  return `${base}${off >= 0 ? '+' : '-'}${p2(off / 60)}:${p2(off % 60)}`;
}

export function kebab(s) {
  return fold(String(s)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function slugify(title) {
  let s = kebab(title);
  if (s.length > 60) {
    const cut = s.slice(0, 61);
    const at = cut.lastIndexOf('-');
    s = at > 0 ? cut.slice(0, at) : s.slice(0, 60);
    s = s.replace(/-+$/, '');
  }
  if (!s) s = `entry-${crypto.createHash('sha1').update(String(title)).digest('hex').slice(0, 6)}`;
  return s;
}

// ───────────────────────────── bundle ─────────────────────────────

const exists = (p) => { try { fs.statSync(p); return true; } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const isBundle = (d) => isDir(d) && (exists(path.join(d, 'kb.config.json')) || exists(path.join(d, 'index.md')));

export function findBundle(cwd, rootOpt) {
  if (rootOpt) {
    const abs = path.resolve(cwd, rootOpt);
    if (isBundle(abs)) return abs;
    if (isBundle(path.join(abs, '.knowledge'))) return path.join(abs, '.knowledge');
    return null;
  }
  let dir = path.resolve(cwd);
  for (;;) {
    const cand = path.join(dir, '.knowledge');
    if (isBundle(cand)) return cand;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadConfig(bundle) {
  const file = path.join(bundle, 'kb.config.json');
  if (!exists(file)) return { types: DEFAULT_TYPES };
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new UsageError(`kb.config.json: ${e.message}`); }
  const types = cfg && typeof cfg.types === 'object' && cfg.types ? cfg.types : DEFAULT_TYPES;
  return { ...cfg, types };
}

export function resolveType(t, cfg) {
  const want = str(t).toLowerCase();
  const name = Object.keys(cfg.types).find((n) => n.toLowerCase() === want);
  return name ? { name, known: true } : { name: str(t), known: false };
}

export function typeDir(name, cfg) {
  const conf = cfg.types[name];
  if (conf && conf.dir) return String(conf.dir).replace(/^\/+|\/+$/g, '');
  return (kebab(name) || 'misc') + 's';
}

function listEntryFiles(bundle) {
  const out = [];
  const walk = (rel) => {
    for (const d of fs.readdirSync(path.join(bundle, rel), { withFileTypes: true })) {
      if (d.name.startsWith('.')) continue;
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) walk(r);
      else if (d.isFile() && d.name.endsWith('.md') && !RESERVED.has(d.name)) out.push(r);
    }
  };
  walk('');
  return out.sort();
}

function loadEntry(bundle, rel) {
  const abs = path.join(bundle, rel);
  try {
    const doc = parseDoc(fs.readFileSync(abs, 'utf8'));
    if (!doc.data) return { rel, abs, error: 'no frontmatter' };
    if (!str(doc.data.type)) return { rel, abs, doc, error: 'missing type' };
    return { rel, abs, doc, data: doc.data };
  } catch (e) {
    return { rel, abs, error: e instanceof YamlError ? `unparseable frontmatter — ${e.message}` : e.message };
  }
}

function loadAll(bundle) {
  return listEntryFiles(bundle).map((rel) => loadEntry(bundle, rel));
}

const entryTitle = (e) => str(e.data.title) || posix.basename(e.rel, '.md');
const writeIfChanged = (file, content) => {
  if (exists(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
};
const oneLine = (s) => str(s).replace(/\s+/g, ' ');
const mdLabel = (s) => s.replace(/([[\]])/g, '\\$1');

/** Rebuild every index.md deterministically. Returns { entries, folders }. */
export function regenerateIndexes(bundle, cfg) {
  const entries = loadAll(bundle).filter((e) => e.data);
  const byFolder = new Map();
  for (const e of entries) {
    const folder = posix.dirname(e.rel);
    if (folder === '.') continue;
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder).push(e);
  }
  const folderType = (folder, list) => {
    const configured = Object.keys(cfg.types).find((n) => typeDir(n, cfg) === folder);
    if (configured) return configured;
    const counts = new Map();
    for (const e of list) { const t = resolveType(e.data.type, cfg).name; counts.set(t, (counts.get(t) || 0) + 1); }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  };
  const folderInfo = [];
  for (const [folder, list] of byFolder) {
    const type = folderType(folder, list);
    const lines = list
      .map((e) => ({ title: entryTitle(e), rel: e.rel, e }))
      .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.rel.localeCompare(b.rel))
      .map(({ title, rel, e }) => {
        const desc = oneLine(e.data.description);
        const dep = str(e.data.status) === 'deprecated' ? ' (deprecated)' : '';
        return `* [${mdLabel(title)}](${posix.basename(rel)})${desc ? ` - ${desc}` : ''}${dep}`;
      });
    writeIfChanged(path.join(bundle, folder, 'index.md'), `# ${type}\n\n${lines.join('\n')}\n`);
    folderInfo.push({ folder, type });
  }
  // Drop indexes of folders that no longer hold entries.
  const walkDirs = (rel) => {
    for (const d of fs.readdirSync(path.join(bundle, rel), { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('.')) continue;
      const r = rel ? `${rel}/${d.name}` : d.name;
      walkDirs(r);
      if (!byFolder.has(r)) {
        const idx = path.join(bundle, r, 'index.md');
        if (exists(idx)) fs.unlinkSync(idx);
        try { fs.rmdirSync(path.join(bundle, r)); } catch { /* not empty */ }
      }
    }
  };
  walkDirs('');
  const order = Object.keys(cfg.types);
  folderInfo.sort((a, b) => {
    const ia = order.indexOf(a.type) >= 0 && typeDir(a.type, cfg) === a.folder ? order.indexOf(a.type) : Infinity;
    const ib = order.indexOf(b.type) >= 0 && typeDir(b.type, cfg) === b.folder ? order.indexOf(b.type) : Infinity;
    return ia - ib || a.folder.localeCompare(b.folder);
  });
  const rootLines = folderInfo.map(({ folder, type }) => {
    const desc = oneLine(cfg.types[type]?.description);
    return `* [${mdLabel(type)}](${folder}/index.md)${desc ? ` - ${desc}` : ''}`;
  });
  writeIfChanged(path.join(bundle, 'index.md'), `---\nokf_version: "0.2"\n---\n\n# Types\n${rootLines.length ? '\n' + rootLines.join('\n') + '\n' : ''}`);
  return { entries: entries.length, folders: folderInfo.length };
}

// ───────────────────────────── links ─────────────────────────────

const LINK_RE = /(!?)\[([^\]\n]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g;

function mapLinks(body, fn) {
  let inFence = false;
  return body.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return line; }
    if (inFence) return line;
    return line.replace(LINK_RE, (full, bang, label, target, title) => {
      const r = fn({ bang, label, target, title });
      return r === null || r === undefined ? full : r;
    });
  }).join('\n');
}

export function resolveLink(fromRel, target) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) return null;
  const hashAt = target.indexOf('#');
  const p = hashAt >= 0 ? target.slice(0, hashAt) : target;
  const hash = hashAt >= 0 ? target.slice(hashAt) : '';
  if (!p) return null;
  let dec = p;
  try { dec = decodeURI(p); } catch { /* keep raw */ }
  const rel = dec.startsWith('/') ? posix.normalize(dec.slice(1)) : posix.normalize(posix.join(posix.dirname(fromRel), dec));
  if (rel.startsWith('../') || rel === '..') return null;
  return { rel, hash, absolute: dec.startsWith('/') };
}

function linkTo(fromRel, toRel, absolute, hash) {
  if (absolute) return `/${toRel}${hash}`;
  const r = posix.relative(posix.dirname(fromRel), toRel);
  return `${r || posix.basename(toRel)}${hash}`;
}

// ───────────────────────────── tokenizer & search ─────────────────────────────

const STOPWORDS = new Set(('a an the this that these those i you he she it we they me us my our your its their ' +
  'is are was were be been being am do does did have has had of in on at to for from by with about as into ' +
  'and or not no what which who whom how why when where can could will would should may might must').split(' '));

export function stem(w) {
  if (!/^[a-z]+$/.test(w) || w.length < 4) return w;
  const cut = (suf, rep = '') => {
    if (!w.endsWith(suf)) return null;
    const s = w.slice(0, -suf.length) + rep;
    return s.length >= 3 ? s : null;
  };
  const undouble = (s) => (/([^aeiouylsz])\1$/.test(s) ? s.slice(0, -1) : s);
  const dropE = (s) => (s.length > 3 && s.endsWith('e') ? s.slice(0, -1) : s);
  let r;
  if ((r = cut('ies', 'y'))) return r;
  if (/(ss|us|is)$/.test(w)) return w;
  if (/(s|x|z|ch|sh)es$/.test(w) && (r = cut('es'))) return dropE(r);
  if ((r = cut('ing'))) return dropE(undouble(r));
  if ((r = cut('ed'))) return dropE(undouble(r));
  if ((r = cut('ly'))) return r;
  if ((r = cut('s'))) return dropE(r);
  return dropE(w);
}

function splitParts(chunk) {
  return chunk
    .split(/[_./-]+/)
    .filter(Boolean)
    .flatMap((s) => s
      .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
      .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
      .replace(/(\p{L})(\p{N})/gu, '$1 $2')
      .replace(/(\p{N})(\p{L})/gu, '$1 $2')
      .split(' '))
    .filter(Boolean)
    .map((s) => s.toLowerCase());
}

const keepToken = (t) => t.length > 1 || /^\d$/.test(t);

function tokenizeChunk(raw, stop = true) {
  const c = fold(raw).replace(/[.-]+$/, '');
  if (!c) return [];
  const compound = c.toLowerCase();
  const parts = splitParts(c);
  const plain = parts.length === 1 && parts[0] === compound;
  const out = [];
  if (!plain && keepToken(compound)) out.push(compound);
  for (const p of parts) {
    if (!keepToken(p)) continue;
    if (stop && STOPWORDS.has(p)) continue;
    out.push(stem(p));
  }
  return out;
}

const CHUNK_RE = /[\p{L}\p{M}\p{N}_./-]+/gu;

/** Tokenize text into search tokens (compounds + stemmed parts, stopwords removed). */
export function tokenize(text, stop = true) {
  const out = [];
  for (const m of String(text).matchAll(CHUNK_RE)) out.push(...tokenizeChunk(m[0], stop));
  return out;
}

export function queryTokens(q) {
  let toks = tokenize(q);
  if (toks.length === 0) toks = tokenize(q, false);
  return [...new Set(toks)];
}

function entryFields(e) {
  const d = e.data;
  return {
    title: tokenize(entryTitle(e)),
    tags: tokenize(asList(d.tags).map(str).join(' ')),
    description: tokenize(str(d.description)),
    resource: tokenize([str(d.resource), ...asList(d.sources).map((s) => (s && typeof s === 'object' ? str(s.resource) : str(s)))].join(' ')),
    body: tokenize(e.doc.body),
  };
}

function isStale(data, now) {
  const v = str(data.stale_after);
  if (!v) return false;
  const t = Date.parse(v);
  return !Number.isNaN(t) && t < now;
}

function sentences(body) {
  const out = [];
  let inFence = false;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    const t = line.trim();
    if (!t) continue;
    if (inFence || t.length <= EXCERPT_WIDTH) { out.push(t); continue; }
    for (const s of t.split(/(?<=[.!?])\s+(?=\S)/)) if (s.trim()) out.push(s.trim());
  }
  return out;
}

function cutAround(line, qset) {
  if (line.length <= EXCERPT_WIDTH) return line;
  let pos = 0;
  for (const m of line.matchAll(CHUNK_RE)) {
    if (tokenizeChunk(m[0]).some((t) => qset.has(t))) { pos = m.index; break; }
  }
  let start = Math.max(0, pos - 40);
  if (start + EXCERPT_WIDTH > line.length) start = Math.max(0, line.length - EXCERPT_WIDTH);
  const end = Math.min(line.length, start + EXCERPT_WIDTH);
  return `${start > 0 ? '…' : ''}${line.slice(start, end).trim()}${end < line.length ? '…' : ''}`;
}

export function excerpt(body, qtoks) {
  const qset = new Set(qtoks);
  const lines = sentences(body).map((text, idx) => ({ text, idx, terms: new Set(tokenize(text).filter((t) => qset.has(t))) }));
  const scored = lines.filter((l) => l.terms.size > 0);
  if (!scored.length) return [];
  const best = scored.reduce((a, b) => (b.terms.size > a.terms.size ? b : a));
  const picks = [best];
  let second = null;
  for (const l of scored) {
    if (l === best) continue;
    const fresh = [...l.terms].filter((t) => !best.terms.has(t)).length;
    if (fresh > 0 && (!second || fresh > second.fresh)) second = { l, fresh };
  }
  if (second) picks.push(second.l);
  return picks.sort((a, b) => a.idx - b.idx).map((l) => cutAround(l.text, qset));
}

/** Rank entries for a query. Returns hits sorted best-first, cutoff and limit applied. */
export function search(entries, query, { types = [], tags = [], limit = DEFAULT_LIMIT, cfg = { types: DEFAULT_TYPES }, now = Date.now() } = {}) {
  const qtoks = queryTokens(query);
  const docs = entries.map((e) => {
    const f = entryFields(e);
    const tf = new Map();
    let len = 0;
    for (const [field, toks] of Object.entries(f)) {
      len += WEIGHTS[field] * toks.length;
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + WEIGHTS[field]);
    }
    return { e, tf, len };
  });
  const N = docs.length;
  const avg = N ? docs.reduce((s, d) => s + d.len, 0) / N : 0;
  const idf = new Map(qtoks.map((t) => {
    const df = docs.filter((d) => d.tf.has(t)).length;
    return [t, Math.log(1 + (N - df + 0.5) / (df + 0.5))];
  }));
  const typeSet = new Set(types.map((t) => resolveType(t, cfg).name.toLowerCase()));
  const tagSet = tags.map((t) => str(t).toLowerCase());
  let hits = [];
  for (const d of docs) {
    const data = d.e.data;
    if (typeSet.size && !typeSet.has(resolveType(data.type, cfg).name.toLowerCase())) continue;
    if (tagSet.length) {
      const have = new Set(asList(data.tags).map((t) => str(t).toLowerCase()));
      if (!tagSet.every((t) => have.has(t))) continue;
    }
    let score = 0;
    for (const t of qtoks) {
      const f = d.tf.get(t);
      if (!f) continue;
      score += idf.get(t) * (f * (K1 + 1)) / (f + K1 * (1 - B + B * (avg ? d.len / avg : 0)));
    }
    if (score <= 0) continue;
    if (str(data.status) === 'deprecated') score *= DEPRECATED_FACTOR;
    hits.push({ e: d.e, score });
  }
  hits.sort((a, b) => b.score - a.score || a.e.rel.localeCompare(b.e.rel));
  if (hits.length) hits = hits.filter((h) => h.score >= CUTOFF * hits[0].score);
  return hits.slice(0, limit).map((h) => ({
    path: h.e.rel,
    type: str(h.e.data.type),
    title: entryTitle(h.e),
    description: oneLine(h.e.data.description),
    status: str(h.e.data.status) || 'stable',
    stale: isStale(h.e.data, now),
    tags: asList(h.e.data.tags).map(str),
    score: Math.round(h.score * 1000) / 1000,
    generated: h.e.data.generated ?? null,
    kb_created: h.e.data.kb_created ?? null,
    excerpt: excerpt(h.e.doc.body, qtoks),
  }));
}

function dateOf(v) {
  const m = str(v).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}

export function formatHit(h) {
  const marks = `${h.status === 'deprecated' ? ' (deprecated)' : ''}${h.stale ? ' (stale)' : ''}${h.status === 'draft' ? ' (draft)' : ''}`;
  const date = dateOf(h.generated && typeof h.generated === 'object' ? h.generated.at : '') || dateOf(h.kb_created);
  const lines = [`${h.path}  [${h.type}] ${h.title}${marks}${date ? `  · ${date}` : ''}`];
  if (h.description) lines.push(`  ${h.description}`);
  for (const x of h.excerpt) lines.push(`  > ${x}`);
  return lines.join('\n');
}

// ───────────────────────────── CLI ─────────────────────────────

const HELP = `kb ${VERSION} — project knowledge base (.knowledge/, OKF + BM25)

usage:
  kb init                         create/fill .knowledge/ in the current dir
  kb add            < docs        add entries (stdin; separate docs with "=== kb:entry ===")
  kb update <addr>  [< patch]     patch frontmatter keys / replace body; --reslug re-derives slug
  kb delete <addr…>               delete entries (inbound links become plain text)
  kb find <query…>                search; --type T (OR), --tag t (AND), -n k
  kb types                        list configured entry types
  kb reindex                      rebuild index.md files, report problems

flags: --root <dir>  --by <actor>  --json  --help  --version
addr:  decisions/x.md | /decisions/x | x (bare slug if unique)
exit:  0 ok · 1 some entries failed · 2 usage/environment error`;

export function parseArgs(argv) {
  const o = { pos: [], types: [], tags: [], json: false, help: false, version: false, reslug: false, root: null, by: null, limit: DEFAULT_LIMIT };
  const takes = new Set(['--root', '--by', '--type', '--tag', '-n', '--limit']);
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a === '--') { o.pos.push(...argv.slice(i + 1)); break; }
    let val;
    if (a.startsWith('--') && a.includes('=')) { val = a.slice(a.indexOf('=') + 1); a = a.slice(0, a.indexOf('=')); }
    if (takes.has(a)) {
      if (val === undefined) { if (i + 1 >= argv.length) throw new UsageError(`${a} needs a value`); val = argv[++i]; }
      if (a === '--root') o.root = val;
      else if (a === '--by') o.by = val;
      else if (a === '--type') o.types.push(...val.split(',').map((s) => s.trim()).filter(Boolean));
      else if (a === '--tag') o.tags.push(val);
      else {
        const n = Number(val);
        if (!Number.isInteger(n) || n < 1) throw new UsageError(`${a} needs a positive integer`);
        o.limit = n;
      }
      continue;
    }
    if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--reslug') o.reslug = true;
    else if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) throw new UsageError(`unknown flag ${a}`);
    else o.pos.push(a);
  }
  return o;
}

function readStdin(io) {
  if (io.stdin !== undefined) return io.stdin;
  if (process.stdin.isTTY) return '';
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function makeEntryText(data, body) {
  const ordered = {};
  for (const k of KEY_ORDER) if (data[k] !== undefined) ordered[k] = data[k];
  for (const [k, v] of Object.entries(data)) if (!(k in ordered) && !MANAGED.includes(k)) ordered[k] = v;
  for (const k of MANAGED) if (data[k] !== undefined) ordered[k] = data[k];
  const b = body.replace(/^\s*\n/, '').replace(/\s+$/, '');
  return serializeDoc({ data: ordered, body: b ? `\n${b}\n` : '' });
}

function missingRequired(data) {
  return REQUIRED.filter((k) => !str(data[k]));
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Resolve a lenient address to a bundle-relative entry path. */
export function resolveAddress(bundle, addr, files = listEntryFiles(bundle)) {
  let a = String(addr).trim().replace(/\\/g, '/');
  if (path.isAbsolute(a) && a.startsWith(bundle.replace(/\\/g, '/') + '/')) a = a.slice(bundle.length + 1);
  a = a.replace(/^\.\//, '').replace(/^\.knowledge\//, '').replace(/^\/+/, '');
  if (!a.endsWith('.md')) a += '.md';
  if (a.includes('/')) {
    const rel = posix.normalize(a);
    return files.includes(rel) ? { rel } : { error: 'not-found' };
  }
  const cands = files.filter((f) => posix.basename(f) === a);
  if (cands.length === 1) return { rel: cands[0] };
  if (cands.length > 1) return { error: 'ambiguous', cands };
  return { error: 'not-found' };
}

function touchGenerated(data, by, at) {
  const g = data.generated && typeof data.generated === 'object' && !Array.isArray(data.generated) ? { ...data.generated } : {};
  g.by = by;
  g.at = at;
  data.generated = g;
}

/** Run the CLI. io: { cwd, env, stdin?, out(line), err(line) }. Returns the exit code. */
export function run(argv, io = {}) {
  const cwd = io.cwd || process.cwd();
  const env = io.env || process.env;
  const out = io.out || ((l) => process.stdout.write(l + '\n'));
  const err = io.err || ((l) => process.stderr.write(l + '\n'));
  try {
    return runCommand(parseArgs(argv), { cwd, env, out, err, io });
  } catch (e) {
    if (e instanceof UsageError) { err(`error: ${e.message}`); return 2; }
    throw e;
  }
}

function runCommand(o, ctx) {
  const { cwd, env, out, err, io } = ctx;
  if (o.version) { out(VERSION); return 0; }
  const cmd = o.pos[0];
  if (o.help || !cmd) { out(HELP); return o.help ? 0 : 2; }
  const by = o.by || `kb/${VERSION}`;
  const events = [];
  const emit = (op, p, extra = {}) => {
    events.push({ op, path: p, ...extra });
    if (!o.json) out(op === 'moved' ? `moved ${p} -> ${extra.to}` : `${op} ${p}`);
  };
  const flush = () => { if (o.json) out(JSON.stringify(events, null, 2)); };

  if (cmd === 'init') {
    const target = o.root ? path.resolve(cwd, o.root) : path.join(cwd, '.knowledge');
    const existed = isBundle(target);
    fs.mkdirSync(target, { recursive: true });
    const show = (f) => path.relative(cwd, f) || f;
    const cfgFile = path.join(target, 'kb.config.json');
    if (!exists(cfgFile)) {
      fs.writeFileSync(cfgFile, JSON.stringify({ types: DEFAULT_TYPES }, null, 2) + '\n');
      emit('created', show(cfgFile));
    }
    const rootIdx = path.join(target, 'index.md');
    const hadIdx = exists(rootIdx);
    const r = regenerateIndexes(target, loadConfig(target));
    if (!hadIdx) emit('created', show(rootIdx));
    if (existed && !o.json) out(`reindexed ${r.entries} entries in ${r.folders} folders`);
    flush();
    return 0;
  }

  const rootOpt = o.root || env.KB_ROOT;
  const bundle = findBundle(cwd, rootOpt);
  if (!bundle) {
    throw new UsageError(rootOpt ? `no bundle at ${rootOpt} — run /setup-kb` : `no .knowledge/ found from ${cwd} — run /setup-kb`);
  }
  const cfg = loadConfig(bundle);
  const knownList = Object.keys(cfg.types).join(', ');
  const at = nowIso(env);

  if (cmd === 'types') {
    if (o.json) { out(JSON.stringify(cfg.types, null, 2)); return 0; }
    for (const [name, t] of Object.entries(cfg.types)) {
      const secs = asList(t.sections);
      out(`${name} — ${str(t.description)}${secs.length ? `  [${secs.join(', ')}]` : ''}`);
    }
    return 0;
  }

  if (cmd === 'find') {
    const query = o.pos.slice(1).join(' ').replace(/["']/g, ' ').trim();
    if (!query) throw new UsageError('find needs query words — to browse, read .knowledge/index.md');
    for (const t of o.types) if (!resolveType(t, cfg).known) err(`warn: unknown type "${t}" — known: ${knownList}`);
    const all = loadAll(bundle);
    for (const e of all) if (!e.data) err(`warn: ${e.rel} ${e.error} — run 'kb reindex'`);
    const hits = search(all.filter((e) => e.data), query, { types: o.types, tags: o.tags, limit: o.limit, cfg, now: Date.parse(at) });
    if (o.json) { out(JSON.stringify(hits, null, 2)); return 0; }
    if (!hits.length) { out(`no matches for "${query}"`); return 0; }
    out(hits.map(formatHit).join('\n\n'));
    return 0;
  }

  if (cmd === 'reindex') {
    const all = loadAll(bundle);
    const files = new Set(all.map((e) => e.rel));
    const now = Date.parse(at);
    for (const e of all) {
      if (!e.data) { err(`warn: ${e.rel} ${e.error}`); continue; }
      const miss = missingRequired(e.data);
      if (miss.length) err(`warn: ${e.rel} missing ${miss.join(', ')}`);
      mapLinks(e.doc.body, ({ target }) => {
        const r = resolveLink(e.rel, target);
        if (r && !files.has(r.rel) && !exists(path.join(bundle, r.rel))) err(`warn: ${e.rel} broken link -> ${target}`);
        return null;
      });
      if (isStale(e.data, now)) err(`stale: ${e.rel} (since ${dateOf(e.data.stale_after) || str(e.data.stale_after)})`);
    }
    const r = regenerateIndexes(bundle, cfg);
    if (o.json) out(JSON.stringify(r)); else out(`reindexed ${r.entries} entries in ${r.folders} folders`);
    return 0;
  }

  if (cmd === 'add') {
    const input = readStdin(io);
    if (!input.trim()) throw new UsageError("add reads entries from stdin — use a quoted heredoc: kb add <<'EOF' … EOF");
    const docs = [];
    let cur = [];
    for (const line of input.replace(/\r\n/g, '\n').split('\n')) {
      if (ENTRY_SEP.test(line)) { docs.push(cur.join('\n')); cur = []; } else cur.push(line);
    }
    docs.push(cur.join('\n'));
    const texts = docs.filter((d) => d.trim());
    const existing = loadAll(bundle).filter((e) => e.data).map((e) => ({
      rel: e.rel, type: resolveType(e.data.type, cfg).name, toks: new Set(tokenize(entryTitle(e))), resource: str(e.data.resource),
    }));
    let failed = 0;
    texts.forEach((text, i) => {
      const n = i + 1;
      let doc;
      try { doc = parseDoc(text.replace(/^\s*\n/, '')); } catch (e) { err(`error: entry ${n} unparseable frontmatter — ${e.message}`); failed++; return; }
      if (!doc.data) { err(`error: entry ${n} has no frontmatter (start it with ---)`); failed++; return; }
      const data = doc.data;
      const title = str(data.title);
      const label = `entry ${n}${title ? ` "${title}"` : ''}`;
      const miss = missingRequired(data);
      if (miss.length) { err(`error: ${label} missing required ${miss.join(', ')}`); failed++; return; }
      const t = resolveType(data.type, cfg);
      if (!t.known) err(`warn: ${label} unknown type "${t.name}" — known: ${knownList}`);
      const rel = `${typeDir(t.name, cfg)}/${slugify(title)}.md`;
      if (exists(path.join(bundle, rel))) {
        err(`exists: ${label} → ${rel} — use 'kb update' or pick a different title`); failed++; return;
      }
      const toks = new Set(tokenize(title));
      const resource = str(data.resource);
      for (const x of existing) {
        if (x.type !== t.name) continue;
        if (jaccard(toks, x.toks) >= SIMILAR_JACCARD || (resource && resource === x.resource)) {
          err(`similar: ${label} ~ ${x.rel} — merge with 'kb update' + 'kb delete' if same topic`);
        }
      }
      data.type = t.name;
      if (str(data.status) === 'stable') delete data.status;
      delete data.generated;
      delete data.kb_created;
      data.generated = { by, at };
      data.kb_created = at;
      const file = path.join(bundle, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, makeEntryText(data, doc.body));
      existing.push({ rel, type: t.name, toks, resource });
      emit('added', rel);
    });
    regenerateIndexes(bundle, cfg);
    flush();
    return failed ? 1 : 0;
  }

  if (cmd === 'update') {
    const addr = o.pos[1];
    if (!addr || o.pos.length > 2) throw new UsageError('update takes exactly one address: kb update <addr> <<EOF … EOF');
    const input = readStdin(io);
    if (!input.trim() && !o.reslug) throw new UsageError('update: nothing to change — pipe a patch doc on stdin or pass --reslug');
    const files = listEntryFiles(bundle);
    const res = resolveAddress(bundle, addr, files);
    if (res.error) { reportAddrError(err, addr, res); return 1; }
    const rel = res.rel;
    const entry = loadEntry(bundle, rel);
    if (!entry.data) { err(`error: ${rel} ${entry.error} — fix it by hand, then 'kb reindex'`); return 1; }
    let patch = { data: {}, body: input };
    const trimmed = input.replace(/^\s*\n/, '');
    if (/^---[ \t]*(\n|$)/.test(trimmed)) {
      try { patch = parseDoc(trimmed); } catch (e) { err(`error: ${rel} unparseable patch — ${e.message}`); return 1; }
    }
    const data = entry.data;
    for (const [k, v] of Object.entries(patch.data || {})) {
      if (MANAGED.includes(k)) continue;
      if (v === null) {
        if (REQUIRED.includes(k)) { err(`error: ${rel} cannot remove required key "${k}"`); return 1; }
        delete data[k];
      } else data[k] = v;
    }
    const miss = missingRequired(data);
    if (miss.length) { err(`error: ${rel} missing required ${miss.join(', ')}`); return 1; }
    const oldType = resolveType(entry.doc.orig.type, cfg).name;
    const t = resolveType(data.type, cfg);
    if (!t.known) err(`warn: ${rel} unknown type "${t.name}" — known: ${knownList}`);
    if (data.type !== t.name) data.type = t.name;
    if (str(data.status) === 'stable') delete data.status;
    const newBody = patch.body.replace(/^\s*\n/, '').replace(/\s+$/, '');
    if (newBody) entry.doc.body = `\n${newBody}\n`;
    touchGenerated(data, by, at);
    const dir = t.name !== oldType ? typeDir(t.name, cfg) : posix.dirname(rel);
    const slug = o.reslug ? slugify(str(data.title)) : posix.basename(rel, '.md');
    const newRel = `${dir}/${slug}.md`;
    if (newRel === rel) {
      fs.writeFileSync(entry.abs, serializeDoc(entry.doc));
      emit('updated', rel);
    } else {
      if (exists(path.join(bundle, newRel))) { err(`exists: ${rel} → ${newRel} — pick a different title`); return 1; }
      // Re-relativize the moved file's own relative links.
      entry.doc.body = mapLinks(entry.doc.body, ({ bang, label, target, title }) => {
        const r = resolveLink(rel, target);
        if (!r || r.absolute) return null;
        const to = r.rel === rel ? newRel : r.rel;
        return `${bang}[${label}](${linkTo(newRel, to, false, r.hash)}${title})`;
      });
      const dest = path.join(bundle, newRel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, serializeDoc(entry.doc));
      fs.unlinkSync(entry.abs);
      emit('moved', rel, { to: newRel });
      rewriteInbound(bundle, new Map([[rel, newRel]]), newRel, by, at, emit);
    }
    regenerateIndexes(bundle, cfg);
    flush();
    return 0;
  }

  if (cmd === 'delete') {
    const addrs = o.pos.slice(1);
    if (!addrs.length) throw new UsageError('delete needs at least one address');
    const files = listEntryFiles(bundle);
    const gone = new Map();
    let failed = 0;
    for (const addr of addrs) {
      const res = resolveAddress(bundle, addr, files);
      if (res.error) { reportAddrError(err, addr, res); failed++; continue; }
      if (gone.has(res.rel)) continue;
      fs.unlinkSync(path.join(bundle, res.rel));
      gone.set(res.rel, null);
      emit('deleted', res.rel);
    }
    if (gone.size) rewriteInbound(bundle, gone, null, by, at, emit);
    regenerateIndexes(bundle, cfg);
    flush();
    return failed ? 1 : 0;
  }

  throw new UsageError(`unknown command "${cmd}" — see kb --help`);
}

function reportAddrError(err, addr, res) {
  if (res.error === 'ambiguous') err(`ambiguous: ${addr} — candidates: ${res.cands.join(', ')}`);
  else err(`not-found: ${addr} — check the path, or 'kb find' it`);
}

/** Rewrite links pointing at moved (to path) or deleted (to null) entries in every other entry. */
function rewriteInbound(bundle, moves, skipRel, by, at, emit) {
  for (const e of loadAll(bundle)) {
    if (!e.data || e.rel === skipRel) continue;
    let deleted = false;
    let moved = false;
    const body = mapLinks(e.doc.body, ({ bang, label, target, title }) => {
      const r = resolveLink(e.rel, target);
      if (!r || !moves.has(r.rel)) return null;
      const to = moves.get(r.rel);
      if (to === null) { deleted = true; return bang ? null : label; }
      moved = true;
      return `${bang}[${label}](${linkTo(e.rel, to, r.absolute, r.hash)}${title})`;
    });
    if (body === e.doc.body) continue;
    e.doc.body = body;
    touchGenerated(e.data, by, at);
    fs.writeFileSync(e.abs, serializeDoc(e.doc));
    if (moved) emit('relinked', e.rel);
    if (deleted) emit('unlinked', e.rel);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  process.exitCode = run(process.argv.slice(2));
}
