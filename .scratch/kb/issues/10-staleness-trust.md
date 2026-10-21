# Staleness and trust lifecycle

Type: grilling
Status: resolved
Assignee: wahajolla
Blocked by: 03, 08

## Question

How does `kb` use OKF's `status` / `stale_after` / `verified` signals? Does `find` down-rank or flag stale/unverified entries, and what's the flow for the agent to verify, refresh, or retire knowledge?

## Answer

Resolved AFK: the user asked for the recommended option at every fork.

**The main trust signal is age plus reading.** The `find` header shows the last-written date (from **Agent triggers**), and the agent always Reads an entry and checks it against reality before relying on it. v1 adds no scoring by trust tier.

**`status`**
- `stable` is the default and is omitted from the file.
- **`deprecated`** marks a superseded entry, mainly a Decision the human agreed is superseded. The agent sets `status: deprecated` and adds a line at the top of the body, `Superseded by [title](/decisions/new.md).`, rather than deleting it, so the history of *why* survives.
  - `find` multiplies a deprecated entry's score by **0.5** before the cutoff and shows a ` (deprecated)` suffix. That way the entry still surfaces when it's the only match, but loses to its replacement.
  - `index.md` keeps the ` (deprecated)` suffix it already has.
- **`draft`** is for an entry the agent saved while unsure, such as a workaround it hasn't confirmed. `find` shows ` (draft)` without changing the score. When a later session confirms the entry, it runs `update` with `status: null`. When it disproves the entry, it fixes or deletes it.

**`stale_after`**
- It's optional. The agent sets it only when the knowledge has a known shelf life: a temporary workaround, a pinned version, an "until X ships". It's an ISO date-time, usually 3–6 months out.
- Once `now > stale_after`, `find` shows ` (stale)` without down-ranking the entry.
- When the agent Reads a stale entry, it re-checks the entry against reality:
  - **Still true:** `update` with a new `stale_after`, or `stale_after: null`.
  - **Wrong:** fix it or delete it, following the contradiction rules in **Agent triggers**.
  - **Can't tell:** flag it to the human.
- `kb reindex` also lists stale entries on stderr as `stale: <path> (since <date>)`, giving a periodic review list. It doesn't fail on them.

**`verified`**
- There's no agent workflow for it in v1. Recording a verification on every routine read would only churn git.
- `kb` preserves `verified` as written. A human can add `{by: human:<id>, at: …}` by hand.
- Text output doesn't show it. `--json` includes it.

**Marker order on the header line:** `path  [Type] Title (deprecated) (stale) (draft)  · 2026-10-21`. Only the markers that apply are shown.

This amends **Output format** (the markers) and **BM25 search details** (the deprecated ×0.5 factor).
