# Build: kb SKILL.md

Type: task
Status: resolved
Assignee: wahajolla
Blocked by: 13

## Question

Write `skills/kb/SKILL.md`: frontmatter (`name`, the description from **Agent triggers**, `allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/kb.mjs *)`); when to find and save; the save test; contradiction rules; the ingest/splitting workflow incl. find-before-write and merge-on-update (**Deduplication on ingest**); stale/draft/deprecated handling; a compact command reference with heredoc examples. Keep it lean: it loads into context.

## Answer

Done: [skills/kb/SKILL.md](../../../skills/kb/SKILL.md). It has `allowed-tools` for the script and `argument-hint` for `/kb ingest`, and covers the find/save rules, the contradiction and stale handling, the entry-writing guide with heredoc examples, a stderr response table, and the ingest workflow.
