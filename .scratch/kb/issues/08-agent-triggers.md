# Agent triggers: when to find, ingest, update, delete

Type: grilling
Status: resolved
Assignee: wahajolla
Blocked by: 03

## Question

Given (from Output format): a `find` hit is only a pointer — the agent always Reads the entry to validate it before relying on it.


What rules does the `kb` skill (and the CLAUDE.md section) give the agent for *when* to call each command? What counts as "valuable for the future" vs noise, how often to ingest, and when a found entry should be updated or deleted instead of trusted.

Also the **ingest workflow** (decided in CLI surface: ingest is the agent's job, not a script command): how a context save is invoked (on request, `/kb ingest <source>`, at session end, before compaction), guidance on splitting a source into entries, and whether it runs as a `context: fork` subagent.

## Answer

**Where the rules live: split.**
- A short always-on section is injected into CLAUDE.md/AGENTS.md by `/setup-kb`. It holds only the reflexes that must fire unprompted.
- Everything else lives in `kb` SKILL.md: command reference, writing entries, the ingest workflow, and the update/delete rules.
- Draft of the injected section:
  ```markdown
  ## Knowledge base

  This project keeps durable knowledge in `.knowledge/` (OKF), managed by the `kb` skill.
  - **Find:** at the start of a task, and when you hit a surprising error or face a non-obvious choice, run `kb find <key terms>`. Read relevant hits before relying on them; if the code contradicts an entry, the code wins — fix or flag the entry.
  - **Save:** when you learn something a future session would need — and couldn't cheaply rediscover from the code, git or docs — save it with the `kb` skill right away, then mention it in one line.
  - Never save task progress, code summaries, or secrets.
  ```
- `kb` SKILL.md `description`: "Search and maintain the project knowledge base in `.knowledge/`. Use to find past decisions, gotchas, how-tos and overviews; to save something worth remembering; or when the user says 'remember this', 'save to kb', 'what do we know about…', or asks to ingest a doc or session."

**When to find.**
- At the start of a task, with the task's key terms.
- On a surprising error, failing test or unexpected behaviour (search the error text or symbol).
- Before a non-obvious choice: library, pattern, architecture.
- Not before every file touch, and not for trivial edits.
- The agent always Reads a relevant hit before relying on it.

**What's worth saving: all three checks must pass.**
1. Not derivable: a future agent couldn't quickly get it from the code, git log or docs.
2. Costly to rediscover: debugging, a discussion with the human, external reading.
3. Durable: still true next week.
- Never saved: task progress or TODOs, summaries of what code does, anything already in CLAUDE.md, one-off session state, secrets.
- Strong signals to save: the human explains a why or makes/reverses a decision; a gotcha took several attempts; a non-obvious procedure got worked out; the human says "remember this".

**When to save.**
- At the checkpoint, right after the thing resolves (gotcha fixed, decision made, procedure works). These are small, immediate `add`s.
- On request: `/kb ingest <source>` (a doc, notes, or "this session").
- No hooks in v1. A PreCompact/Stop hook could later be an opt-in from `/setup-kb`.

**Autonomy: save, then announce.**
- No asking first. After saving, the agent says one line, e.g. `Saved to kb: gotchas/vitest-esm-mocks.md`. The human can veto it, and the agent then runs `kb delete`.
- For a requested ingest, the agent lists the entries written at the end.

**When a found entry is wrong.**
- Current reality wins. The agent never follows an entry against what the code shows.
- Wrong but fixable: the agent runs `kb update` with the correction and announces it ("Updated kb: … (was wrong about X)").
- Obsolete (the thing no longer exists): the agent runs `kb delete` and announces it.
- Unsure: the agent leaves the entry alone and flags it to the human in one line. No guess-edits.
- **Decision entries are never rewritten or deleted on the agent's own call.** If one looks superseded, the agent asks the human.
- Status, `verified` and `stale_after` are handled in **Staleness and trust lifecycle**.

**Ingest workflow: splitting a source.**
- One entry = one file = one topic, answering one question. The title reads like the answer to a search.
- Each entry stands alone without the source and cites it in `sources` (path, URL or commit).
- The three save checks apply to every candidate. The aim is not to restate the source.
- Size: no hard cap. Small things stay small (a gotcha is about 5–15 lines). A long topic (e.g. an app's auth flow) can be one entry of up to about 300 lines. Past that, split into linked entries: an overview links to its parts.
- Long entries put the summary first: the `description` plus a short opening paragraph, then `##` sections, so a reader can stop early.
- Find before writing: run `kb find` per candidate and update an existing entry instead of duplicating it. The exact rules are in **Deduplication on ingest**.
- Write all new entries in one multi-doc `add` batch.

**No `context: fork`.**
- Ingest runs inline in the `kb` skill. Forking would also fork `find`, it works only in Claude Code, and a fork can't see the session.
- For a very large file source, SKILL.md says the agent *may* have a subagent (where its harness offers one) read the source and return draft entries. The main agent writes them with `add`.
- The package stays at two skills.

**New default type: `Overview`.** This amends the **OKF profile** decision.
- `"Overview": { "description": "How a subsystem or flow works: parts, data flow, key invariants", "sections": ["Summary", "Components", "Flow", "Invariants"] }`, folder `overviews/`.
- Defaults are now Decision, Gotcha, How-To, Fact and Overview.

**Attribution.** The agent always passes `--by <agent>/<model>` (e.g. `claude-code/opus-5.5`).

**Timestamps.** This amends the **OKF profile** and **Output format** decisions.
- `kb_created`: an ISO-8601 timestamp with offset, written on `add` and never changed afterwards.
- `generated.at` keeps meaning "last written" and is refreshed on every update.
- The `find` header line shows the last-written date: `gotchas/vitest-esm-mocks.md  [Gotcha] vi.mock hoisting breaks ESM imports  · 2026-10-21`.
- `--json` carries both full timestamps.
