# Output format for the agent

Type: grilling
Status: resolved
Assignee: wahajolla
Blocked by: 05

## Question

What does the agent see back? JSON vs compact text, how much of each `find` hit is returned (snippet vs full body vs frontmatter only), default result count, and confirmation output for writes — including per-entry reports for a multi-doc `add` batch and per-address reports for `delete` (stream/exit-code conventions are fixed in the CLI surface ticket) — optimised for token cost and parseability.

## Answer

**Format**
- Output is compact, line-oriented text by default. It is meant for an LLM reader and costs fewer tokens than JSON.
- A global `--json` flag prints the same data as JSON, for tests and for humans using `jq`. The skill doc teaches only the text form.

**`find` hits.** Each hit is printed like this:
```
gotchas/vitest-esm-mocks.md  [Gotcha] vi.mock hoisting breaks ESM imports
  vi.mock is hoisted above imports, so factory closures can't reference module vars.
  > …use vi.hoisted() to declare the mock fns, then reference them in the factory…
```
- **Header line:** `path  [Type] Title`. When `status` isn't the default, it is shown as a suffix such as ` (deprecated)`. Stale and unverified markers are decided in **Staleness and trust lifecycle**.
- **Description line:** the description, indented by 2 spaces.
- **Excerpt:** up to 2 body lines, each prefixed with `> `.
  - Prose paragraphs are split into sentences.
  - Each line is scored by how many distinct query terms it contains, using the search tokenizer. The best line is taken first. A second line is added only if it contains query terms the first one lacks.
  - Lines are printed in body order, each cut to about 160 characters around the first match, with `…` at the cuts.
  - Terms are not highlighted.
  - If no body line contains a query term, the excerpt is omitted.
- **Text output leaves out** the score (raw BM25 scores can't be compared across queries) and tags. Both are included in `--json`.
- **Result count:**
  - The default is 5 hits. `-n/--limit <k>` overrides it.
  - A relative cutoff drops any hit scoring below about 30% of the top hit, even when `-n` is given. The ratio is tuned in the BM25 build.
  - There is no pagination.
- **No results:** prints `no matches for "<query>"` to stdout and exits 0.

**Writes and other commands**
- **stdout:** one line for each change, in input order:
  - `add` prints `added <path>`.
  - `update` prints `updated <path>`, or `moved <old> -> <new>` if the entry moved.
  - `delete` prints `deleted <path>`.
  - Every file whose links were rewritten gets `relinked <path>` (after a move) or `unlinked <path>` (after a delete).
- **stderr:** problems use the prefixes set in **CLI surface**. A failed batch entry is identified by its 1-based position and title, for example `exists: entry 3 "Use pnpm workspaces" → decisions/use-pnpm-workspaces.md — use 'kb update' or pick a different title`, or `warn: entry 2 unknown type "Bug" — known: Decision, Gotcha, How-To, Fact`.
- Index regeneration is never printed.
- **`reindex`** prints a one-line summary, `reindexed N entries in M folders`. Validation problems go to stderr as `warn:` lines.
- **`types`** prints one line per type: `Name — description  [Section, …]`. The brackets are omitted when a type has no sections.
- **`--json` for writes:** an array of the same events, `[{ "op": "added", "path": … }, …]`. stderr is unchanged.

**Input for Agent triggers:** a `find` hit only points to a file. The agent always Reads the entry before relying on it, to check that it's correct.

**Amended by [Agent triggers](08-agent-triggers.md):** the `find` header line ends with the last-written date (`· 2026-10-21`). `--json` carries `kb_created` and `generated.at` in full.
**Amended by [Staleness and trust lifecycle](10-staleness-trust.md):** header markers ` (deprecated) (stale) (draft)`, in that order, before the date.
