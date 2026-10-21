# Build slicing for v1

Type: grilling
Status: resolved
Assignee: wahajolla
Blocked by: 08, 09, 10, 12

## Question

How does the v1 implementation split into build tickets, and in what order? Candidate slices: frontmatter/YAML round-trip reader and writer; bundle discovery, layout, slugs, `index.md` regeneration and link rewriting; `add`/`update`/`delete`/`types`/`reindex`; tokenizer and BM25 `find` with excerpts; the `kb` skill doc (`SKILL.md`); the `/setup-kb` skill. For each slice, what is its acceptance test (per `/tdd`, `node:test` with fixture bundles?), and which slices can run in parallel? Folds in the fog patch on testing strategy.

## Answer

Resolved AFK: the user asked for the recommended option at every fork.

**Repo layout (the `npx skills add` source):**
```
skills/kb/SKILL.md
skills/kb/kb.mjs          ← single file, zero deps, shipped
skills/setup-kb/SKILL.md
test/*.test.mjs           ← node:test, not shipped
test/fixtures/<bundle>/   ← fixture bundles
SPEC.md  README.md
package.json              ← only "type": "module" and "test": "node --test"; no deps
```
- **Testability:** `kb.mjs` exports its pure functions and guards `main()` with `import.meta.url === pathToFileURL(process.argv[1]).href`. Tests can then import the units and also spawn the CLI.
- **Two test levels** (per `/tdd`):
  - **Unit tests** for parsing, tokenizing and scoring.
  - **CLI tests** that copy a fixture bundle to a temp dir, run `node skills/kb/kb.mjs …`, and assert stdout, stderr, the exit code and the resulting files.
- **Versioning:** semver. A `VERSION` constant in `kb.mjs` feeds `kb --version` and the default `generated.by: kb/<version>`. v1 = `1.0.0`. Releases are git tags on the repo. This graduates the "Publishing / README" fog.

**Slices** (each one is a build ticket):

| # | Slice | Blocked by | Acceptance |
|---|---|---|---|
| A | Write SPEC.md | — | One spec consolidating every decision on the map; build slices cite it |
| B | Frontmatter reader/writer | — | Round-trip tests: inline maps, both list styles, lists of maps, unknown keys and key order preserved, `null` removal |
| C | Bundle core | B | Discovery, config and types, slugs, folder mapping, index.md regeneration, link rewrite/unlink — unit + fixture tests |
| D | Write commands + CLI shell | C | `init`/`add`/`update`/`delete`/`types`/`reindex`, arg parsing, `--json`, exit codes, stderr prefixes, `kb_created`, stale listing in reindex — CLI tests |
| E | Search | C | Tokenizer, stemmer, stopwords, BM25F, filters, deprecated ×0.5, cutoff, excerpts, markers and date in `find` output — unit + CLI tests on a ~30-entry fixture bundle; constants tuned here |
| F | `similar:` warning in `add` | D, E | Batch/bundle near-duplicate warning, CLI tests |
| G | `kb` SKILL.md | A | Agent-trigger rules, ingest workflow, command reference; `allowed-tools` for the script |
| H | `setup-kb` SKILL.md | A | The setup flow from **`/setup-kb` interview and wiring** |
| I | Package, README, end-to-end check | D, E, F, G, H | `npx skills add <local path>` into a scratch project, run `/setup-kb`, do a save and a find in a real session |

**What runs in parallel:**
- A and B start immediately.
- G and H only need the spec.
- D and E run in parallel after C.
- F waits for both D and E.
- I is last.

The project directory isn't a git repo yet. Slice I runs `git init`, which `npx skills add` and releases need.
