import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../skills/kb/kb.mjs';

export const NOW = '2026-10-21T12:00:00Z';
process.env.TZ = 'UTC';

export function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kb-test-'));
}

/** Run the CLI in-process. Returns { code, out, err } as joined strings. */
export function kb(cwd, args, stdin, env = {}) {
  const out = [];
  const err = [];
  const code = run(args, { cwd, env: { KB_NOW: NOW, ...env }, stdin, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

export function initProject() {
  const dir = tmpProject();
  kb(dir, ['init']);
  return dir;
}

export const read = (dir, rel) => fs.readFileSync(path.join(dir, '.knowledge', rel), 'utf8');
export const has = (dir, rel) => fs.existsSync(path.join(dir, '.knowledge', rel));

export function entry({ type = 'Fact', title, description = 'A description.', extra = '', body = 'Body text.' }) {
  return `---\ntype: ${type}\ntitle: ${title}\ndescription: ${description}\n${extra}---\n\n${body}\n`;
}
