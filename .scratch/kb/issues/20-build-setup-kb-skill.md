# Build: setup-kb SKILL.md

Type: task
Status: resolved
Assignee: wahajolla
Blocked by: 13

## Question

Write `skills/setup-kb/SKILL.md` implementing the flow in **`/setup-kb` interview and wiring**: existing-bundle check, two questions, `kb init` via the kb skill, CLAUDE.md/AGENTS.md detection and marker-wrapped section, report.

## Answer

Done: [skills/setup-kb/SKILL.md](../../../skills/setup-kb/SKILL.md). It loads the `kb` skill for `kb init`, asks the two questions, picks the CLAUDE.md/AGENTS.md targets, and writes the marker-wrapped section, then reports.
