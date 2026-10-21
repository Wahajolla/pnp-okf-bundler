# Deduplication on ingest

Type: grilling
Status: resolved
Assignee: wahajolla
Blocked by: 05, 07

## Question

Ingest is agent-driven (see CLI surface), so: should the ingest workflow run `find` before `add`, and/or should `add` itself detect near-duplicates (e.g. run a BM25 query on the new content) and refuse / warn / suggest `update`? What threshold, and what does the agent see?

## Answer

Resolved AFK: the user asked for the recommended option at every fork.

**Primary defence: the agent's workflow (in SKILL.md).** This applies to checkpoint saves and requested ingests alike.
- Before writing a candidate, the agent runs `kb find <title + key terms>` and Reads any hit that might cover the same topic.
- **Same topic → `kb update` instead of `add`.**
  - Merge the new knowledge into the body: rewrite it as one coherent entry, not an appended log.
  - Because `update` replaces lists whole, send the **union** of the old and new `tags`/`sources`.
  - Announce it as "Updated kb: …".
- **Related but distinct → `add`,** with a bundle-absolute link to the related entry, and a link back added through `update` where that helps.
- **Contradicts an existing entry →** follow the contradiction rules in **Agent triggers**: reality wins, and a Decision is never changed without asking the human.

**Backstop: a `similar:` warning in `add`.** The script warns but never refuses.
- For each new entry, `add` compares the entry against the existing entries of the **same type**, and against the other entries in the same batch.
- An entry is flagged when:
  - its title-token Jaccard is ≥ 0.6, using the search tokenizer's parts, with stopwords removed and stems applied; or
  - it shares the same non-empty `resource`.
- BM25 isn't used for this, because raw scores aren't comparable across queries.
- The entry is still written. stderr gets `similar: entry 2 "Vitest ESM mock hoisting" ~ gotchas/vitest-esm-mocks.md — merge with 'kb update' + 'kb delete' if same topic`. The exit code stays 0, since this is a warning.
- On `similar:`, the agent Reads both entries. If they are the same topic, it merges into the older one and deletes the new one.
- The threshold is a script constant, tuned in the build alongside the BM25 constants.
- This amends **CLI surface** and **Output format** by adding the `similar:` stderr prefix.
