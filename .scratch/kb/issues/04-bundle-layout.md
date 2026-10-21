# Bundle layout, file naming, index.md and links

Type: grilling
Status: resolved
Blocked by: 01, 03

## Question

How is `.knowledge/` organised on disk: directory per type (types are configurable in `kb.config.json`, so how is a directory name derived from a type, and what happens to unknown-type entries)? Where does `kb.config.json` sit relative to OKF-reserved files? slug rules and collision handling? Does `kb` regenerate `index.md` files on every write, and does v1 support/maintain links between entries?

## Answer

**Layout: one folder level, one folder per type.**
```
.knowledge/
  index.md          ← root, okf_version: "0.2"
  kb.config.json    ← at bundle root; not .md, so OKF ignores it
  decisions/  index.md  use-pnpm-workspaces.md
  gotchas/  how-tos/  facts/
```
- The folder name is the type in kebab-case with a trailing `s` appended (`Decision → decisions/`, `How-To → how-tos/`). An optional `"dir"` on a type's config entry overrides it.
- Unknown types follow the same rule.
- Folders never nest. Topics go in `tags`.
- A type change through `update` moves the file to the new type's folder, so its concept ID changes (see Links below).

**Slugs.**
- A slug is derived from `title`: lowercase, ASCII, non-alphanumeric runs replaced with `-`, cut to about 60 characters at a word boundary. A title that is non-Latin or comes out empty falls back to `entry-<short-hash>`.
- A slug is fixed once created. A title change does not rename the file. Renames happen only on a type change or an explicit rename (the CLI flag is decided in the CLI surface ticket).
- A collision is refused. `ingest` exits non-zero with `exists: <path> — use 'kb update' or pick a different title`.

**index.md.**
- `kb` regenerates it on every write (`ingest`, `update`, `delete`) for the affected folders and the root. A full rebuild (`kb reindex`) is to be confirmed in the CLI surface ticket.
- The format follows the spec and uses no LLM step. A type folder's index is one `# <Type>` section of `* [Title](slug.md) - description` lines sorted by title. The root index is a `# Types` section that links each folder, using the type's description from config. `okf_version: "0.2"` goes only in the root.
- Deprecated entries stay listed with a ` (deprecated)` suffix.
- Output is deterministic, so identical content gives identical indexes and merges stay clean.

**No `log.md` in v1.** It is optional in OKF. Git history already covers the audit trail, and a single file prepended by every write causes merge conflicts across branches and worktrees.

**Links.**
- Bodies may contain standard OKF markdown links. The bundle-absolute form (`/decisions/x.md`) is preferred, and the skill doc tells the agent to use it. No wikilinks.
- On a move (type change or rename), `kb` automatically rewrites inbound links in every entry. It matches both absolute and relative forms that resolve to the moved file.
- On `delete`, inbound links are turned into plain text (`[label](/x.md)` becomes `label`), and `kb` reports which files it changed.
- Any file whose links were rewritten gets its `generated.at` refreshed, and the affected indexes are regenerated.
- There is no link graph, no backlinks and no link-based ranking in v1.
