# OKF profile for session knowledge: entry types and frontmatter

Type: grilling
Status: resolved
Blocked by: 01

## Question

What subset/profile of OKF does `kb` write and require? Which concept `type`s exist for session knowledge (e.g. decision, gotcha, how-to, fact?), which frontmatter keys are mandatory vs optional, and what values `kb` fills automatically (timestamps, `generated`, `sources` like session/commit/file)?

## Answer

**Type vocabulary: configurable, with suggested defaults.**
- Types are defined in `.knowledge/kb.config.json`. `/setup-kb` seeds it with four defaults: `Decision`, `Gotcha`, `How-To` and `Fact`. Each type has a one-line `description` and a list of suggested body `sections`:
  ```json
  "types": {
    "Decision": { "description": "A choice made and why", "sections": ["Context", "Decision", "Consequences"] },
    "Gotcha":   { "description": "A trap: symptom → cause → fix", "sections": ["Symptom", "Cause", "Fix"] },
    "How-To":   { "description": "A non-obvious procedure", "sections": ["Steps"] },
    "Fact":     { "description": "A stable truth about the project", "sections": [] }
  }
  ```
- An unknown type triggers a warning, not a rejection. The write succeeds and the configured list is printed. Any non-empty `type` is valid OKF.
- Type matching is case-insensitive, and the configured spelling is the one written.
- `kb types` prints the types, their descriptions and their sections.
- Body sections are suggestions only. `kb` never validates the body.

**Frontmatter profile.**
- Required on `ingest`: `type`, `title` (used to derive the slug) and `description` (one sentence; it serves as the search snippet and the index line).
- Optional, supplied by the agent: `tags`; `sources` (a list of `{resource}`, such as a repo path, commit SHA, or PR/issue URL, with `id` only when the body cites it with a footnote); `resource` (only when the entry is about a single file or symbol); `status` (defaults to `stable` and is omitted when stable).
- Auto-filled: `generated: {by, at}`. `at` is an ISO-8601 timestamp with an offset, set on ingest and refreshed on update. `by` defaults to `kb/<version>` and can be overridden with `--by` (`claude-code/<model>`, `human:<id>`).
- `kb` adds no IDs (the path is the identity) and no hit counters.
- `verified` and `stale_after` are allowed and preserved. Their semantics are decided in **Staleness and trust lifecycle**.
- Unknown keys are always preserved on rewrite. Custom keys that `kb` itself writes use the `kb_` prefix.

**Amended by [Agent triggers](08-agent-triggers.md):** a fifth default type, `Overview` (`overviews/`); `kb_created` is written once on `add`, while `generated.at` means "last written".
