# How `npx skills add` packages and installs a skill

Type: research
Status: resolved
Blocked by: —

## Question

How does the `npx skills` installer (used by Matt Pocock's skills, installing into `~/.agents/skills` with symlinks into `~/.claude/skills`) expect a source repo to be laid out? Can a skill ship extra files (a `kb.mjs`) next to `SKILL.md`, and how does a skill reliably reference its own directory so the agent can run `node <skill-dir>/kb.mjs`? Can one repo ship two skills (`kb`, `setup-kb`)? Which agents besides Claude Code does it target? Write findings to `.scratch/kb/research/skills-installer.md`.

## Context

Findings: [skills-installer](../research/skills-installer.md)

## Answer

Layout `skills/kb/` and `skills/setup-kb/`, each with a `SKILL.md` whose frontmatter has `name` and `description`; `name` must match the folder name. Each skill folder is copied whole and nothing outside it is installed, so `kb.mjs` must be self-contained inside `skills/kb/`, and the two skills cannot share files. Refer to the script as `node ${CLAUDE_SKILL_DIR}/kb.mjs` (documented for Claude Code). Add `allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/kb.mjs *)` so it runs without prompts. Other agents resolve paths relative to the skill dir. Project install is the installer's default (`./.agents/skills/` with a symlink in `./.claude/skills/`, tracked in `./skills-lock.json`); `-g` installs globally. The installer targets about 79 agents. `context: fork` works only in Claude Code. Full detail: [skills-installer](../research/skills-installer.md).
