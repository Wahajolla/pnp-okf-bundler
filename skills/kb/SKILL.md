---
name: kb
description: Search and maintain the project knowledge base in .knowledge/. Use to find past decisions, gotchas, how-tos and overviews; to save something worth remembering; or when the user says "remember this", "save to kb", "what do we know about…", or asks to ingest a doc or session.
argument-hint: "[find <terms> | ingest <file|url|session>]"
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/kb.mjs *)
---

# kb: project knowledge base

`.knowledge/` is an OKF bundle of markdown entries, one topic per file, grouped by type (`decisions/`, `gotchas/`, `how-tos/`, `facts/`, `overviews/`). The script is `node ${CLAUDE_SKILL_DIR}/kb.mjs`. Below it's written `kb`, but always run the full command. Paths it prints are relative to `.knowledge/`.

If there's no `.knowledge/` (exit 2, "run /setup-kb"), tell the user and suggest `/setup-kb`.

## Find

When to run it:
- at the start of a task, with the task's key terms;
- when you hit a surprising error, failing test or odd behaviour (search the error text or symbol);
- before a non-obvious choice (library, pattern, architecture).

Skip it for trivial edits.

```bash
node ${CLAUDE_SKILL_DIR}/kb.mjs find vi.mock hoisting          # plain words, OR'd; no syntax
node ${CLAUDE_SKILL_DIR}/kb.mjs find auth --type Overview,Decision --tag security -n 10
```

Each hit is printed like this:
```
gotchas/vitest-esm-mocks.md  [Gotcha] vi.mock hoisting breaks ESM imports (stale)  · 2026-10-21
  <description>
  > <best matching body line>
```
- **A hit is only a pointer.** Read `.knowledge/<path>` before relying on it.
- **`(deprecated)`:** superseded. Follow its "Superseded by" link.
- **`(draft)`:** unconfirmed.
- **`(stale)`:** past its shelf life. Re-check it (see below).
- **The date** is when the entry was last written.
- **Browsing:** read `.knowledge/index.md`.

**When reality contradicts an entry, reality wins.**
- **Fixable:** `update` it and say "Updated kb: <path> (was wrong about X)".
- **Obsolete:** `delete` it and say so.
- **Unsure:** leave it alone and flag it to the user in one line.
- **Never rewrite or delete a `Decision` on your own.** Ask the user. If they agree it's superseded, set `status: deprecated` and add `Superseded by [title](/decisions/new.md).` as the first body line.
- **Stale entry:** re-check it. If still true, `update` it with a new `stale_after` (or `stale_after: null`); if wrong, fix or delete it; if you can't tell, flag it.

## Save

Save only knowledge that passes **all three** checks:
1. **Not derivable.** A future agent couldn't quickly get it from the code, git log or docs.
2. **Costly to rediscover.** It took debugging, a discussion with the user, or external reading.
3. **Durable.** It will still be true next week.

**Never save:**
- task progress or TODOs;
- summaries of what code does;
- anything already in CLAUDE.md/AGENTS.md;
- session state;
- secrets.

**Strong signals to save:**
- the user explains a *why*, or makes or reverses a decision;
- a gotcha took several attempts;
- a non-obvious procedure finally works;
- the user says "remember this".

**When:** save right after the thing resolves, without asking first. Then say one line: `Saved to kb: gotchas/x.md`. If the user objects, `delete` it.

### Writing an entry

- **One file per topic.** The title reads like the answer to a search. Use bundle-absolute links to related entries (`[title](/decisions/x.md)`).
- **Size:**
  - Small things stay small: a gotcha is about 5–15 lines.
  - A big topic (e.g. the app's auth flow) can be one `Overview` of up to about 300 lines. Past that, split it into linked entries.
  - Long entries start with the summary, then `##` sections.
- **Frontmatter:**
  - **Required:** `type`, `title` and `description` (one sentence; it's the search snippet).
  - **Optional:**
    - `tags`: a short list.
    - `sources`: a list of `{resource: path | commit | URL}`.
    - `resource`: only when the entry is about one file or symbol.
    - `status: draft` when unconfirmed.
    - `stale_after`: an ISO date-time, only for knowledge with a known shelf life, such as a workaround or a pinned version.
- `kb` fills in `generated` and `kb_created` itself.
- **Always pass `--by <agent>/<model>`**, e.g. `--by claude-code/opus-5.5`.
- **Types:** run `kb types` to list them with their suggested sections. The defaults are:
  - Decision: Context / Decision / Consequences
  - Gotcha: Symptom / Cause / Fix
  - How-To: Steps
  - Fact
  - Overview: Summary / Components / Flow / Invariants

**Find before writing.** Run `kb find <title terms>` and Read any plausible match.
- **Same topic:** `update` the existing entry instead. Merge the new knowledge into one coherent body, and send the **union** of the old and new `tags` and `sources`, because lists are replaced whole.
- **Related:** `add` a new entry and link the two.

```bash
node ${CLAUDE_SKILL_DIR}/kb.mjs add --by claude-code/opus-5.5 <<'EOF'
---
type: Gotcha
title: vi.mock hoisting breaks ESM imports
description: vi.mock is hoisted above imports, so factory closures can't reference module vars.
tags: [vitest, testing]
sources:
  - resource: src/test/setup.ts
---

## Symptom
ReferenceError: Cannot access 'mockFetch' before initialization.

## Cause
…

## Fix
Declare the mocks with `vi.hoisted()` and reference them inside the factory.
=== kb:entry ===
---
type: Fact
title: …
description: …
---
…
EOF
```
- Always use a quoted heredoc (`<<'EOF'`).
- Separate multiple entries with a line `=== kb:entry ===`.
- Output is one `added <path>` per entry. Problems go to stderr.

### Responding to stderr

| stderr | What to do |
|---|---|
| `exists:` | Use `update`, or pick a more specific title |
| `similar: … ~ <path>` | The entry was written. Read both: if they're the same topic, merge into the older one (`update`) and `delete` the new one |
| `warn: … unknown type` | Fine if intended; otherwise `update` the type |
| Exit 1 | Some entries failed. The others were written |
| Exit 2 | Usage error. Nothing was written |

## Update, delete, maintain

```bash
# patch: only the keys given change; key: null removes one; a body replaces the old body
node ${CLAUDE_SKILL_DIR}/kb.mjs update gotchas/x.md --by claude-code/opus-5.5 <<'EOF'
---
tags: [vitest, esm]
stale_after: null
---
EOF
node ${CLAUDE_SKILL_DIR}/kb.mjs update x --reslug <<'EOF'   # after a title change, to rename the file
---
title: Better title
---
EOF
node ${CLAUDE_SKILL_DIR}/kb.mjs delete gotchas/x.md facts/y.md
node ${CLAUDE_SKILL_DIR}/kb.mjs reindex      # after hand edits; lists warnings and stale entries
```

- **Addresses:** `gotchas/x.md`, `/gotchas/x`, or a bare slug `x` if it's unique.
- **Moves:** changing `type` moves the file to that type's folder. Links to the entry are rewritten automatically.
- **Deletes:** links to a deleted entry become plain text.
- **Updating `index.md`:** never edit it by hand. `kb` regenerates it.

## Ingest a source (`/kb ingest <source>`)

Use this for a doc, notes, a URL, or "this session" ("save what we learned").
1. **Read the source.** If it's a very large file, you may have a subagent read it and return draft entries.
2. **List candidate topics** and apply the three save checks to each. Don't restate the source: a 20-page doc may yield 4 entries.
3. **Run `find` for each candidate.** Merge into existing entries with `update` where they cover the same topic.
4. **Write the rest in one `add` batch.** Each entry stands alone, cites the source in `sources`, and uses a type from `kb types`.
5. **Report** the list of entries added or updated.
