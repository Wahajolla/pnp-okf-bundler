# CLI surface: commands, flags, addressing, input

Type: grilling
Status: resolved
Assignee: wahajolla
Blocked by: 03, 04

## Question

What is the exact command surface of `kb.mjs`? How does `ingest` take content (flags, stdin, file)? How do `update`/`delete` address an entry (path, slug, id)? Are `list`/`show`/`reindex` in v1? Is there an explicit rename (e.g. `update --rename`), and how is a type change requested? (Layout, slugs, index regeneration and link rewriting are decided — see Bundle layout ticket.) (`kb types` is already decided — see OKF profile ticket.) How are frontmatter fields (`tags`, `sources`, `--by`) passed? Error/exit-code conventions.

## Answer

**Ingest is a skill workflow, not a CLI command.** The agent reads any source (a document, notes, the current session), decides how to split it, and turns it into one or more entries in the profile shape. It then writes them with `add`. The script never infers fields. (The workflow itself is covered in **Agent triggers**.)

**v1 commands:** `add`, `update`, `delete`, `find`, `types` and `reindex`. There is no `show` or `list`: the agent reads entry files and `index.md` directly.

**`add`**
- Reads one or more full OKF docs (frontmatter and body) from stdin, through a quoted heredoc (`<<'EOF'`).
- Multiple docs are separated by a line `=== kb:entry ===`. `---` can't be used because it delimits frontmatter.
- Each entry is validated (`type`/`title`/`description`) and written on its own. A failure in one entry, such as a collision or a missing key, doesn't stop the others.
- All indexes are regenerated once, at the end.

**`update <addr>`** patches the entry from a stdin doc in the same shape:
- Frontmatter keys present in the input overwrite the same keys. Every other key is kept, unknown and `kb_` keys included.
- `key: null` removes a key. Required keys can't be removed.
- Lists (`tags`, `sources`) are replaced whole.
- A non-empty body replaces the old body. With no body, the old one is kept.
- `generated.at` is always refreshed.
- A changed `type` moves the file to the new type's folder.
- `--reslug` re-derives the slug from the title after the patch. A collision is refused.
- Every move rewrites inbound links, as decided in **Bundle layout**.

**`delete <addr…>`**
- Takes one or more addresses, each reported on its own.
- No confirmation and no `--force`: git is the undo.
- Inbound links are unlinked, as decided in **Bundle layout**.

**Addressing**
- An entry is addressed by its bundle-relative path, accepted leniently: `decisions/x.md`, `/decisions/x.md`, `decisions/x`, or a bare slug `x` when only one folder has it.
- An ambiguous bare slug fails and lists the candidate paths. It never guesses.

**`find <query words…>`:** the query is positional. Filters are decided in **BM25 search details** and result shape in **Output format**.

**`reindex`:** rebuilds every `index.md` from disk and reports validation problems (missing required keys, unparseable frontmatter, broken links) without failing on them.

**Bundle discovery**
- The script walks up from the current directory to the first `.knowledge/` containing `kb.config.json` or `index.md`.
- `--root <dir>` or `KB_ROOT` overrides it.
- If nothing is found, it exits 2 with `no .knowledge/ found from <cwd> — run /setup-kb`.
- It never auto-creates a bundle.

**Conventions**
- Exit codes:
  - `0`: all OK. Warnings, such as an unknown type, still exit 0.
  - `1`: at least one entry or address failed. The others still applied.
  - `2`: usage or environment error. Nothing was written.
- Results go to stdout. Errors and warnings go to stderr, one per line, each starting with a stable prefix (`error:`, `warn:`, `exists:`, `ambiguous:`, `not-found:`) followed by the path or address and a short hint.
- `--root`, `--by` and `--help` (compact usage) work on every command.

**Amended by [Deduplication on ingest](09-dedup-on-ingest.md):** new stderr prefix `similar:`, a warning that `add` emits after still writing the entry (exit 0). **Amended by [`/setup-kb` interview and wiring](12-setup-kb-interview.md):** new command `kb init`, which creates or fills `.knowledge/` and never overwrites. **Amended by [Staleness and trust lifecycle](10-staleness-trust.md):** `reindex` lists `stale:` entries on stderr.
