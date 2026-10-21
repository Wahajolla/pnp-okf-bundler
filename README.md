# kb: a knowledge base for coding agents

`kb` gives each project a knowledge base that coding agents like Claude Code look up and add to on their own. It holds decisions, gotchas, procedures and overviews: things a future session would otherwise have to rediscover.

- **Storage:** plain markdown files in `.knowledge/`, using the [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) (OKF v0.2). They're readable by humans, diffable, and committed with your code.
- **Search:** local BM25 ranking that understands code identifiers (`parseJSONFile`, `vi.mock`, `src/utils/x.ts`). No embeddings, services or API keys.
- **Packaging:** two [agent skills](https://agentskills.io) and a single zero-dependency Node script.

## Install

```bash
npx skills add Wahajolla/pnp-okf-bundler
```

This installs two skills:
- **`kb`** finds, saves, updates and ingests knowledge, through `kb.mjs`.
- **`setup-kb`** sets up a project once.

Then, in each project, run:

```
/setup-kb
```

It creates `.knowledge/` and asks whether to commit it (the default) and whether to keep the default entry types. It also adds a short `## Knowledge base` section to `CLAUDE.md` and/or `AGENTS.md`, so every session knows to use it.

Requires Node ≥ 18.

## What the agent does

- **Finds before working.** At the start of a task, on a surprising error, or before a non-obvious choice, it runs `kb find <terms>` and reads the relevant hits.
- **Saves what's worth keeping.** It saves knowledge that isn't derivable from the code, was costly to discover, and is durable. It saves right after the fact, then says so in one line. Progress notes, code summaries and secrets are never saved.
- **Keeps entries honest.** When the code contradicts an entry, the code wins: the agent fixes the entry, deletes it, or flags it to you. It never rewrites a recorded Decision without asking.
- **Ingests sources.** `/kb ingest docs/architecture.md` (or "save what we learned this session") turns a source into a few atomic entries, merging them with existing ones.

## The bundle

```
.knowledge/
  index.md            generated
  kb.config.json      entry types
  decisions/  gotchas/  how-tos/  facts/  overviews/
```

Each entry is a markdown file with OKF frontmatter:

```markdown
---
type: Gotcha
title: vi.mock hoisting breaks ESM imports
description: vi.mock is hoisted above imports, so factory closures can't reference module vars.
tags: [vitest, testing]
generated:
  by: claude-code/opus-5.5
  at: 2026-10-21T14:05:00+03:00
kb_created: 2026-10-21T14:05:00+03:00
---

## Fix
Declare the mocks with `vi.hoisted()` …
```

You can edit entries by hand. Run `kb reindex` afterwards to rebuild the indexes and check for problems.

## CLI

The agent runs the script through the skill. You can also run it directly with `node <skill-dir>/kb.mjs`:

```
kb init                         create/fill .knowledge/ in the current dir
kb add            < docs        add entries (stdin; separate docs with "=== kb:entry ===")
kb update <addr>  [< patch]     patch frontmatter keys / replace body; --reslug re-derives slug
kb delete <addr…>               delete entries (inbound links become plain text)
kb find <query…>                search; --type T (OR), --tag t (AND), -n k
kb types                        list configured entry types
kb reindex                      rebuild index.md files, report problems

flags: --root <dir>  --by <actor>  --json  --help  --version
```

The full behaviour is specified in [SPEC.md](SPEC.md). The design decisions behind it are in [`.scratch/kb/`](.scratch/kb/map.md).

## Development

```bash
npm test      # node:test; no dependencies
```

## License

MIT
