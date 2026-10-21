# kb v1 — specification

`kb` is an agent-first, per-project knowledge base. Knowledge lives as an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) v0.2 bundle in `.knowledge/` and is searched with BM25. It ships as two agent skills installed with `npx skills add`:

- **`kb`** — `SKILL.md` + `kb.mjs`, a single zero-dependency Node script.
- **`setup-kb`** — `SKILL.md` only; scaffolds a project once.

This document consolidates the decisions recorded in `.scratch/kb/` (the wayfinder map). Each section names the ticket it comes from.

---

## 1. Package layout  *(Skills installer, Build slicing)*

```
skills/kb/SKILL.md
skills/kb/kb.mjs          shipped; self-contained
skills/setup-kb/SKILL.md
test/                     node:test suites + fixtures (not shipped)
package.json              no dependencies; "test": "node --test"
```

- Each skill folder is copied whole; the two skills share nothing.
- The agent runs the script as `node ${CLAUDE_SKILL_DIR}/kb.mjs …` (Claude Code); other agents resolve `kb.mjs` relative to the skill directory. `SKILL.md` declares `allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/kb.mjs *)`.
- `kb.mjs` exports its pure functions and only runs `main()` when executed directly.
- Versioning: semver; `VERSION` constant in `kb.mjs` (v1 = `1.0.0`), printed by `kb --version`.

## 2. Bundle layout  *(Bundle layout, OKF profile, Agent triggers)*

```
.knowledge/
  index.md            root index; frontmatter okf_version: "0.2"
  kb.config.json      types config (not .md, so OKF ignores it)
  decisions/  index.md  use-pnpm-workspaces.md
  gotchas/  how-tos/  facts/  overviews/
```

- **One entry = one `.md` file = one topic.** The bundle-relative path is the identity; `kb` adds no IDs.
- **One folder per type**, one level deep, never nested. Folder = type in kebab-case + `s` (`Decision → decisions`, `How-To → how-tos`); a type's optional `"dir"` overrides it. Unknown types follow the same rule.
- **Slug** = title → NFKD, strip diacritics, lowercase, runs of non-`[a-z0-9]` → `-`, trimmed, cut to ≤ 60 chars at a `-` boundary. Empty result → `entry-<6 hex of sha1(title)>`. The slug is fixed at creation: a title change doesn't rename. Only a type change or `--reslug` moves a file. Collisions are refused.
- **No `log.md`.** Git is the audit trail.

### 2.1 `kb.config.json`

```json
{
  "types": {
    "Decision": { "description": "A choice made and why", "sections": ["Context", "Decision", "Consequences"] },
    "Gotcha":   { "description": "A trap: symptom → cause → fix", "sections": ["Symptom", "Cause", "Fix"] },
    "How-To":   { "description": "A non-obvious procedure", "sections": ["Steps"] },
    "Fact":     { "description": "A stable truth about the project", "sections": [] },
    "Overview": { "description": "How a subsystem or flow works: parts, data flow, key invariants", "sections": ["Summary", "Components", "Flow", "Invariants"] }
  }
}
```

- Type matching is case-insensitive; the configured spelling is written.
- An unknown type is a **warning**, never a rejection (any non-empty `type` is valid OKF).
- Sections are suggestions; `kb` never validates bodies.
- If the bundle has no `kb.config.json`, the defaults above apply.

### 2.2 `index.md` files

Regenerated deterministically after every write and by `kb reindex`; a file is only rewritten when its content changes. No LLM step.

Folder index:
```markdown
# Decision

* [Use pnpm workspaces](use-pnpm-workspaces.md) - We use pnpm workspaces for the monorepo.
* [Old build tool](old-build-tool.md) - … (deprecated)
```
Entries sorted by title (case-insensitive), then path. The heading is the folder's type.

Root index:
```markdown
---
okf_version: "0.2"
---

# Types

* [Decision](decisions/index.md) - A choice made and why
```
Lists every folder that holds entries: configured types first in config order, then other folders alphabetically. A folder emptied by `delete` loses its `index.md`, and is removed if empty.

### 2.3 Links

- Bodies use standard markdown links; the preferred form is bundle-absolute (`[label](/decisions/x.md)`). No wikilinks. External URLs are untouched. Links inside fenced code blocks are ignored.
- **Move** (type change, `--reslug`): every inbound link, absolute or relative, is rewritten to the new path and keeps its form. Relative links inside the moved file are re-relativized.
- **Delete**: inbound links become plain text (`[label](/x.md)` → `label`).
- Any file whose links change gets `generated.at` refreshed and is reported (`relinked` / `unlinked`).
- No link graph, backlinks or link-based ranking.

## 3. Entry format  *(OKF spec read, OKF profile, Agent triggers, Staleness)*

```markdown
---
type: Gotcha
title: vi.mock hoisting breaks ESM imports
description: vi.mock is hoisted above imports, so factory closures can't reference module vars.
tags: [vitest, testing]
sources:
  - resource: src/test/setup.ts
generated:
  by: claude-code/opus-5.5
  at: 2026-10-21T14:05:00+03:00
kb_created: 2026-10-21T14:05:00+03:00
---

…body…
```

| Key | Who | Notes |
|---|---|---|
| `type` | agent, **required** | resolved against config |
| `title` | agent, **required** | slug source |
| `description` | agent, **required** | one sentence; search snippet and index line |
| `tags` | agent | list of short strings |
| `sources` | agent | list of `{resource}` (+ `id` only when cited by footnote) |
| `resource` | agent | only when the entry is about a single file or symbol |
| `status` | agent | `stable` (default, omitted) · `draft` · `deprecated` |
| `stale_after` | agent | ISO date-time; only when the knowledge has a known shelf life |
| `verified` | human | preserved; no agent workflow in v1 |
| `generated` | **kb** | `{by, at}`: `by` = `--by` or `kb/<version>`; `at` = last written |
| `kb_created` | **kb** | set once on `add`, never changed |

- Timestamps are ISO 8601 with an explicit offset (`2026-10-21T14:05:00+03:00`).
- Unknown keys are always preserved, byte-for-byte when untouched, in their original order. Custom keys `kb` writes use the `kb_` prefix.
- Frontmatter YAML subset understood: block and flow mappings, block and flow lists, lists of mappings, quoted/plain scalars, `|`/`>` block scalars, comments.

## 4. CLI  *(CLI surface, Output format, Dedup, Staleness, Setup-kb)*

```
kb init                        create/fill .knowledge/ here (never overwrites)
kb add            < docs       add one or more entries (stdin)
kb update <addr>  [< doc]      patch one entry; --reslug re-derives the slug
kb delete <addr…>              delete entries
kb find <query…>  [--type T] [--tag t] [-n k]
kb types                       list configured types
kb reindex                     rebuild every index.md, report problems
```
Global flags: `--root <dir>`, `--by <actor>`, `--json`, `--help`, `--version`.

### 4.1 Bundle discovery

Walk up from the current directory to the first `.knowledge/` containing `kb.config.json` or `index.md`. `--root <dir>` or `KB_ROOT` override it: the directory is the bundle itself, or a directory containing `.knowledge/`. Nothing found → exit 2, `error: no .knowledge/ found from <cwd> — run /setup-kb`. Only `init` creates a bundle.

### 4.2 Addressing

Bundle-relative path, accepted leniently: `decisions/x.md`, `/decisions/x.md`, `decisions/x`, `.knowledge/decisions/x.md`, an absolute path inside the bundle, or a bare slug `x` when exactly one folder has it. Ambiguous → `ambiguous:` with candidates; missing → `not-found:`. Never guesses.

### 4.3 Commands

**`init`** creates `kb.config.json` (defaults) and the root `index.md` in `./.knowledge/` (or `--root`). Prints `created <path>` per file. If a bundle already exists, it creates only the missing files and reindexes.

**`add`** reads stdin, a quoted heredoc. Multiple docs are separated by a line `=== kb:entry ===`. For each doc:
- validates `type`/`title`/`description`;
- refuses a collision with `exists:`;
- warns on an unknown type and on near-duplicates (`similar:`, §4.5);
- fills `generated` and `kb_created`;
- writes the file.

A failure in one doc doesn't stop the others. Indexes are regenerated once at the end. Each written doc prints `added <path>`.

**`update <addr>`** reads a stdin doc in the same shape. Frontmatter is optional; input without a leading `---` is a body.
- Keys present in the input overwrite the same keys. `key: null` removes a key, except the required ones. Lists are replaced whole.
- A non-empty body replaces the old body. An empty body keeps it.
- `generated` and `kb_created` in the input are ignored. `generated.at` is always refreshed.
- A changed `type` moves the file to the new type's folder. `--reslug` re-derives the slug from the title. A move to an existing path is refused.
- Prints `updated <path>`, or `moved <old> -> <new>` followed by `relinked <path>` lines.

**`delete <addr…>`** removes the files and unlinks inbound links. It prints `deleted <path>` and `unlinked <path>` per change. There is no confirmation; git is the undo.

**`types`** prints one line per type: `Name — description  [Section, …]`. The brackets are omitted when a type has no sections.

**`reindex`** rebuilds every `index.md` and prints `reindexed N entries in M folders`. It reports problems without failing:
- `warn:` for unparseable frontmatter, a missing required key, or a broken link;
- `stale: <path> (since <date>)` for each stale entry.

### 4.4 Conventions

- **Exit codes:** `0` OK (warnings included) · `1` at least one entry/address failed, the rest applied · `2` usage or environment error, nothing written.
- **stdout:** results, one line per change, in input order.
- **stderr:** one line per problem, with a stable prefix: `error:` `warn:` `exists:` `ambiguous:` `not-found:` `similar:` `stale:`. A batch entry is identified as `entry N "Title"`.
- **`--json`:** the same data as JSON on stdout (writes: `[{ "op": "added", "path": … }]`). stderr is unchanged.

### 4.5 Near-duplicate warning in `add`  *(Dedup)*

A new entry is compared with existing entries of the **same type**, and with earlier entries in the same batch. It is flagged when either:
- title-token Jaccard ≥ 0.6 (search tokenizer, stopwords removed, stemmed), or
- it has the same non-empty `resource`.

The entry is still written, and stderr gets:
`similar: entry 2 "Title" ~ gotchas/x.md — merge with 'kb update' + 'kb delete' if same topic`

## 5. Search  *(BM25 search, Output format, Staleness)*

- **Live scan**, no cache. Every `*.md` under the bundle except `index.md`/`log.md` is an entry. An unparseable entry, or one with no `type`, is skipped with a `warn:`. A missing title or description falls back to the slug or empty.
- **Tokenizer** (shared by queries, entries, excerpts and similarity):
  1. NFKD, strip combining marks.
  2. Split on `[^\p{L}\p{N}_./-]`. Each chunk is a *compound*; a trailing `.`/`-` is trimmed.
  3. Parts: split the compound on `_ . / -`, on camelCase/acronym boundaries and on letter↔digit boundaries. Everything is lowercased.
  4. Emit the compound and its parts. A plain word is emitted once.
  5. Drop 1-char tokens unless they are digits.
  6. Remove about 40 English stopwords from parts and plain words (never compounds). An all-stopword query uses its raw tokens.
  7. Light stemming of `[a-z]+` parts and words: `-ies→y`, `-es`, `-s`, `-ing`, `-ed`, `-ly`, min stem 3, undoubling a final double consonant, then dropping a final `e` (so `cache`/`caches` → `cach`).
- **Scoring: BM25F.** Field weights title 3, tags 2.5, description 2, resource + `sources[].resource` 1.5, body 1. `k1 = 1.2`, `b = 0.75`. IDF = `ln(1 + (N − df + 0.5)/(df + 0.5))` over the whole bundle. `type` is not indexed.
- **Query:** OR of deduplicated tokens, with no syntax. `--type` is repeatable or comma-separated, OR'd and case-insensitive; an unknown type warns. `--tag` is repeatable and AND'd. Filters apply before scoring, while IDF stays bundle-wide. A query is required (exit 2, hint: read `index.md`).
- **Status:** a `deprecated` entry's score is ×0.5.
- **Ranking:** score desc, then path asc. Keep hits with ≥ 30% of the top score, then take the first `-n` (default 5).

### 5.1 Output

```
gotchas/vitest-esm-mocks.md  [Gotcha] vi.mock hoisting breaks ESM imports (stale)  · 2026-10-21
  vi.mock is hoisted above imports, so factory closures can't reference module vars.
  > …use vi.hoisted() to declare the mock fns, then reference them in the factory…
```
- **Header:** `path  [Type] Title`, then the markers that apply, in the order ` (deprecated) (stale) (draft)`, then `  · <date of generated.at>`.
  - The path is bundle-relative.
  - An entry is stale when `stale_after` is earlier than now.
- **Description:** indented 2 spaces.
- **Excerpt:** up to 2 body lines, `  > `-prefixed.
  - Prose is split into sentences.
  - Lines are ranked by distinct query terms. A second line is added only if it covers terms the first lacks.
  - Lines are shown in body order, each cut to about 160 chars around the first match with `…`.
  - With no matching body line there is no excerpt.
- **Not shown in text:** score and tags. Both are in `--json`, along with `generated`, `kb_created` and `stale`.
- **No hits:** `no matches for "<query>"` on stdout, exit 0.

## 6. Agent behaviour  *(Agent triggers, Dedup, Staleness)*

Rules are split. A short always-on section in CLAUDE.md/AGENTS.md (§7) holds the find and save reflexes. `skills/kb/SKILL.md` holds everything else.

- **Find:**
  - When: at the start of a task, on a surprising error or failing test, and before a non-obvious choice. Not per file, and not for trivial edits.
  - Read every relevant hit before relying on it.
- **Save:** only when all three checks pass:
  1. not derivable from code, git or docs;
  2. costly to rediscover;
  3. durable.
  - Never saved: progress or TODOs, code summaries, anything already in CLAUDE.md, session state, secrets.
  - When: at the checkpoint, right after the thing resolves, or on request (`/kb ingest <source>`).
  - After saving, the agent announces it in one line.
- **Contradiction:**
  - Reality wins.
  - The agent fixes a wrong entry with `update`, deletes an obsolete one, and flags it to the human when unsure.
  - **Decision entries are never rewritten or deleted without asking the human.** A superseded one becomes `status: deprecated` with a "Superseded by" link.
- **Ingest a source:**
  - One topic per entry; entries stand alone and cite `sources`.
  - The three checks apply to every candidate.
  - Size: a soft ceiling of about 300 lines; split past it into linked entries. Long entries put the summary first.
  - Run `find` before writing. Merge into an existing entry via `update`, sending the union of tags and sources.
  - Write all new entries in one `add` batch, then list them.
  - No `context: fork`. A very large file may be read by a subagent that returns draft entries.
- **Staleness:**
  - Set `stale_after` only for knowledge with a known shelf life.
  - On reading a `(stale)` entry, re-check it and refresh, fix, or delete it.
  - Use `draft` for unconfirmed entries and clear it once confirmed.
- **Attribution:** always pass `--by <agent>/<model>`.

## 7. `setup-kb`  *(Setup-kb interview and wiring)*

1. If `.knowledge/` exists, say so, run `kb init` (fill gaps + reindex), and skip to step 4.
2. Ask, one at a time:
   - commit or gitignore `.knowledge/`? (default: **commit**; gitignore appends `.knowledge/` to `.gitignore`)
   - keep the default types? (default: **keep**; otherwise edit `kb.config.json` after init)
3. Run `kb init` through the `kb` skill.
4. Wire the instructions file:
   - CLAUDE.md, AGENTS.md or both, whichever exist independently.
   - If CLAUDE.md is a symlink to AGENTS.md or imports `@AGENTS.md`, write to AGENTS.md only.
   - If neither exists, create CLAUDE.md under Claude Code, else AGENTS.md.
   - The section is wrapped in `<!-- kb:start -->` … `<!-- kb:end -->` and appended. A re-run replaces it between the markers. If there is an unmarked `## Knowledge base` heading, ask first.
5. Report the files created or changed and suggest a first step.

No hooks are offered.

The injected section:

```markdown
## Knowledge base

This project keeps durable knowledge in `.knowledge/` (OKF), managed by the `kb` skill.
- **Find:** at the start of a task, and when you hit a surprising error or face a non-obvious choice, run `kb find <key terms>`. Read relevant hits before relying on them; if the code contradicts an entry, the code wins — fix or flag the entry.
- **Save:** when you learn something a future session would need — and couldn't cheaply rediscover from the code, git or docs — save it with the `kb` skill right away, then mention it in one line.
- Never save task progress, code summaries, or secrets.
```

## 8. Out of scope for v1

Embeddings/vector search · cross-project or global KB · UI/graph visualizer · server or MCP server · session hooks · `log.md` · `show`/`list` commands · a cache/index file · an agent `verified` workflow.
