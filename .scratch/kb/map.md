# Map: kb — agent-first local knowledge base (OKF + BM25)

Label: wayfinder:map

## Destination

A working **v1 of `kb`**: an installable skill package (`npx skills add`) shipping a zero-dependency `kb.mjs` (Node) with `ingest / find / update / delete` over a per-project OKF bundle at `.knowledge/`, searched with BM25 — plus a `/setup-kb` skill that scaffolds the bundle and wires CLAUDE.md/AGENTS.md so agent sessions use it on their own. Accompanied by a spec recording the decisions.

## Notes

- **This map carries execution**: once the spec decisions are made, build tickets (writing `kb.mjs`, the `kb` skill, the `/setup-kb` skill) belong on the map too. Done = v1 working, not just spec locked.
- **Agent-first.** Primary user is an AI agent (Claude Code) during sessions; humans secondary.
- **Runtime:** single Node `.mjs` file, no npm dependencies.
- **Install shape (settled during charting):** installed once via `npx skills add` → `kb` skill (`SKILL.md` + `kb.mjs`) and `setup-kb` skill. `/setup-kb` runs once per project: scaffolds `.knowledge/` (OKF root `index.md`), asks commit-vs-gitignore, adds a `## Knowledge base` section to CLAUDE.md/AGENTS.md. Script runs from the skill dir; no vendoring into repos in v1.
- Modeled on Matt Pocock's skills pattern (`~/.claude/skills/setup-matt-pocock-skills`).
- OKF source: https://github.com/GoogleCloudPlatform/open-knowledge-format (SPEC.md v0.2).
- Tracker: local markdown (`.scratch/kb/`). Research findings go in `.scratch/kb/research/` (project is not a git repo, so no research branches).
- Skills to consult: `/grilling`, `/domain-modeling`; `/tdd` for build tickets.

## Decisions so far

<!-- one line per resolved ticket -->

- [OKF v0.2 spec: precise read](issues/01-okf-spec-read.md) — only `type` required; trust/lifecycle keys optional; index.md/log.md reserved; YAML reader must round-trip unknown keys
- [How `npx skills add` packages and installs a skill](issues/02-skills-installer.md) — `skills/kb/` + `skills/setup-kb/`, self-contained folders; run via `${CLAUDE_SKILL_DIR}/kb.mjs`; project install is the default
- [OKF profile for session knowledge: entry types and frontmatter](issues/03-okf-profile.md) — types configurable in `.knowledge/kb.config.json` (defaults Decision/Gotcha/How-To/Fact + suggested body sections), unknown type = warning; required `type`/`title`/`description`, auto `generated {by,at}`, unknown keys preserved
- [Bundle layout, file naming, index.md and links](issues/04-bundle-layout.md) — one folder per type (kebab+`s`, `dir` override), slug from title fixed at creation, collision refused; `index.md` auto-regenerated deterministically, no `log.md`; links auto-rewritten on move, unlinked to plain text on delete
- [CLI surface: commands, flags, addressing, input](issues/05-cli-surface.md) — ingest is an agent skill workflow; CLI is `add` (multi-doc stdin, `=== kb:entry ===`) / `update` (frontmatter patch, `--reslug`) / `delete <addr…>` / `find` / `types` / `reindex`; lenient path addressing; bundle found by walking up; exit 0/1/2 with prefixed stderr
- [Output format for the agent](issues/06-output-format.md) — compact text (+ `--json`); hit = path/[Type]/title + description + ≤2 `> ` excerpt lines; 5 hits default, `-n`, ~30% relative cutoff; writes print one line per change (`added`/`moved`/`relinked`/…), problems on stderr
- [BM25 search details](issues/07-bm25-search.md) — live scan, no cache; compound+parts tokenizer, light English stemming, ~40 stopwords; BM25F (title 3/tags 2.5/desc 2/resource 1.5/body 1); OR query, no syntax; `--type` (OR) / `--tag` (AND); scans only the bundle minus `index.md`/`log.md`
- [Agent triggers: when to find, ingest, update, delete](issues/08-agent-triggers.md) — short always-on CLAUDE.md section + full rules in SKILL.md; find at task start/surprising error/non-obvious choice; save only non-derivable, costly, durable knowledge at the checkpoint or on request, then announce; reality beats entries, Decisions never changed unasked; one topic per file (soft ~300 lines); no fork; adds `Overview` type, `kb_created`, date in `find` header
- [Deduplication on ingest](issues/09-dedup-on-ingest.md) — agent finds before writing and merges into an existing entry via `update` (union tags/sources); `add` warns `similar:` (same-type title Jaccard ≥ 0.6 or same `resource`) but still writes
- [Staleness and trust lifecycle](issues/10-staleness-trust.md) — trust = date + reading; `deprecated` for superseded entries (×0.5 score, kept for history), `draft` for unconfirmed, `stale_after` only for known shelf life (shown `(stale)`, listed by `reindex`); no `verified` workflow in v1
- [`/setup-kb` interview and wiring](issues/12-setup-kb-interview.md) — new `kb init` scaffolds/fills the bundle; two questions (commit by default, keep default types); writes a marker-wrapped section to CLAUDE.md and/or AGENTS.md idempotently; no hooks
- [Build slicing for v1](issues/11-build-slicing.md) — repo layout, node:test unit + CLI tests on fixture bundles, semver `1.0.0`; nine build tickets: spec, frontmatter, bundle core, write commands, search, similar warning, two SKILL.md files, package + e2e
- [Build: write SPEC.md](issues/13-build-spec.md) — [SPEC.md](../../SPEC.md) consolidates every decision; adds final-`e` stemming
- [Build: frontmatter reader/writer](issues/14-build-frontmatter.md) — chunked YAML subset; untouched keys round-trip byte-for-byte
- [Build: bundle core](issues/15-build-bundle-core.md) — discovery, config, slugs, addressing, deterministic indexes, link rewrite/unlink
- [Build: write commands and CLI shell](issues/16-build-write-commands.md) — init/add/update/delete/types/reindex, `--json`, exit codes, stderr prefixes
- [Build: search (find)](issues/17-build-search.md) — BM25F as specified; 12/12 fixture ranking queries pass with the spec constants
- [Build: similar: warning in add](issues/18-build-similar-warning.md) — implemented against bundle and batch
- [Build: kb SKILL.md](issues/19-build-kb-skill.md) — agent rules, entry guide, stderr table, ingest workflow
- [Build: setup-kb SKILL.md](issues/20-build-setup-kb-skill.md) — two questions, `kb init`, marker-wrapped CLAUDE.md/AGENTS.md section
- [Build: package, README and end-to-end check](issues/21-build-package-e2e.md) — public repo, README, MIT; `npx skills add` install and a real headless session save+find verified

## Not yet specified

_None. Destination reached: v1 built and verified. Remaining manual check: the interactive `/setup-kb` flow in a live session._

## Out of scope

- Embeddings / vector search: BM25 or similar local lexical search only.
- Cross-project / global knowledge base: per-project bundle only.
- UI or graph visualizer.
- Server or MCP server: CLI + skill only.
- Session hooks (PreCompact/Stop save sweeps): not in v1, and not offered as an opt-in; see [Agent triggers](issues/08-agent-triggers.md) and [`/setup-kb` interview and wiring](issues/12-setup-kb-interview.md).
