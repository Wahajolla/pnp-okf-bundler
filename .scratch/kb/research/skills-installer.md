# How `npx skills add` packages and installs a skill

Researched 2026-10-17 against `skills@1.7.2` (npm `latest`), the CLI from [vercel-labs/skills](https://github.com/vercel-labs/skills). Sources are the published npm tarball (`README.md`, `dist/cli.mjs`), the Claude Code skills docs, the Agent Skills spec, and the installer's state on this machine.

## TL;DR for the `kb` / `setup-kb` plan

- Layout: `skills/kb/SKILL.md` + `skills/kb/kb.mjs`, and `skills/setup-kb/SKILL.md`. Running `npx skills add <owner>/<repo>` finds both, and `--skill kb` picks one.
- The installer copies the whole skill directory recursively, so `kb.mjs` (and any subfolders) comes along. Only `metadata.json`, `.git/`, `__pycache__/` and `__pypackages__/` are left out. File modes are kept, so an executable bit survives.
- In `SKILL.md`, refer to the script as `node ${CLAUDE_SKILL_DIR}/kb.mjs`. Claude Code expands that to the skill's directory. To skip the permission prompt, add `allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/kb.mjs *)`. Other agents don't expand the variable. For them, the Agent Skills spec says to use paths relative to the skill root, such as `kb.mjs`.
- Frontmatter must have `name` and `description`, both strings. The installed folder takes its name from `name`, not from the source folder, so keep the two equal. The spec requires that anyway.

## 1. Source repo layout

The CLI looks in these places (README, "Skill Discovery"):

- the repo root, if it contains `SKILL.md` (a single-skill repo)
- `skills/`, `skills/.curated/`, `skills/.experimental/`, `skills/.system/`
- every agent-specific dir, such as `.claude/skills/`, `.agents/skills/`, `.cursor`-style dirs and so on (full list in the README)
- skills declared in `.claude-plugin/marketplace.json` or `.claude-plugin/plugin.json`, at the path they declare

Each container is walked up to **three levels deep**. That covers `skills/<name>/SKILL.md`, `skills/<category>/<name>/SKILL.md` and `skills/<cat>/<cat>/<name>/SKILL.md`. A `SKILL.md` at a shallower level shadows anything nested under it. `--full-depth` also searches outside the containers. If nothing turns up in the standard locations, the CLI falls back to a recursive search. (README "Skill Discovery", "Plugin Manifest Discovery")

Matt Pocock's repo uses the category layout. The local lock records paths like `skills/engineering/setup-matt-pocock-skills/SKILL.md` and `skills/productivity/grill-me/SKILL.md` (`~/.agents/.skill-lock.json`).

Sources it accepts: GitHub `owner/repo` shorthand, full GitHub URLs including `/tree/<branch>/<path>` to point at one skill, GitLab, Azure Repos, any git URL including SSH, local paths, and direct `SKILL.md` or archive URLs. Private repos work through your existing git, `gh` or SSH credentials. (README "Source Formats", "Private Repositories")

Validation: a `SKILL.md` gets skipped with a warning unless its frontmatter has both `name` and `description` as strings (`dist/cli.mjs` `parseSkillMd`, around lines 1267-1273). Setting `metadata.internal: true` hides a skill unless `INSTALL_INTERNAL_SKILLS=1` is set (README "Optional Fields").

Install name: `sanitizeName(skill.name || basename(skill.path))`. That lowercases the name and turns anything outside `[a-z0-9._]` into `-` (`dist/cli.mjs` `sanitizeName`, `installSkillForAgent`, around lines 2185 and 2288). The Agent Skills spec also requires `name` to "match the parent directory name" and to use only lowercase letters, numbers and hyphens, at most 64 characters ([agentskills.io/specification](https://agentskills.io/specification)).

## 2. Extra files next to SKILL.md

They're kept. `copyDirectory(skill.path, dest)` reads every entry in the skill folder and recurses into subdirectories. It skips only:

```js
const EXCLUDE_FILES = new Set(["metadata.json"]);
const EXCLUDE_DIRS  = new Set([".git", "__pycache__", "__pypackages__"]);
```

Each file is copied with `cp(..., { dereference: true })` and then `chmod`'d to the source mode (`dist/cli.mjs` around lines 2377-2420). Symlinks inside the skill get resolved to real files, and a broken symlink is skipped with a warning.

Because the copy is per skill directory, a file outside the skill folder (for example a repo-root `lib/`) is **not** installed. Anything `kb.mjs` imports has to live inside `skills/kb/`, or be bundled into `kb.mjs`.

The update hash (`skillFolderHash` in the lock) also covers every file in the folder except `.git` and `node_modules` (`collectFiles`, around line 1148). Editing `kb.mjs` on its own is therefore enough to trigger `npx skills update`.

Local example: `~/.claude/skills/setup-matt-pocock-skills/` holds `SKILL.md` plus `domain.md`, `issue-tracker-{github,gitlab,local}.md`, `triage-labels.md` and `agents/openai.yaml`. Its `SKILL.md` links to them with relative links such as `[issue-tracker-github.md](./issue-tracker-github.md)`. Several other installed skills (`teach`, `grill-me` and others) also ship `agents/openai.yaml`, which carries Codex UI and policy metadata.

## 3. How a skill references its own directory

**Claude Code** gives you `${CLAUDE_SKILL_DIR}` ([code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills), "Available string substitutions"):

> `${CLAUDE_SKILL_DIR}` — The directory containing the skill's `SKILL.md` file. For plugin skills, this is the skill's subdirectory within the plugin, not the plugin root. Use this in bash injection commands to reference scripts or files bundled with the skill, regardless of the current working directory.

> Claude Code substitutes `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PROJECT_DIR}` in two places: the skill's markdown content, and Bash rules in the `allowed-tools` frontmatter. ... Using the same variable in both places lets a skill run a bundled script without a permission prompt.

The doc's example:

```yaml
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)
---
Run `${CLAUDE_SKILL_DIR}/scripts/render.sh <csv-file>` to render the chart.
```

The docs also warn that commands run in the session's current working directory, which moves when Claude runs `cd`. They say to use `${CLAUDE_SKILL_DIR}` for any path that has to resolve the same way every time. The variable is substituted in `` !`cmd` `` injection blocks too, so `` !`node ${CLAUDE_SKILL_DIR}/kb.mjs status` `` would run before the skill text reaches the model.

"Base directory for this skill: ..." is the header Claude Code adds when it loads a skill. In this session it read `Base directory for this skill: /Users/wahajolla/.claude/skills/research`. The skills docs don't document that header, so treat it as a hint. `${CLAUDE_SKILL_DIR}` is the documented contract.

Symlinks: "a `<skill-name>` entry in the enterprise, personal, or project location can be a symlink to a directory elsewhere on disk. Claude Code reads `SKILL.md` from the target and loads the skill once even if several locations point at the same target" (skills docs, "Skill folders also follow these rules"). The installer's symlink layout therefore works with Claude Code.

**Portable fallback.** The Agent Skills spec says: "When referencing other files in your skill, use relative paths from the skill root" (e.g. `scripts/extract.py`). It also names `scripts/`, `references/` and `assets/` as optional subdirectories ([agentskills.io/specification](https://agentskills.io/specification)). Agents other than Claude Code are expected to resolve those relative paths against the skill root, but there's no shared variable across agents.

## 4. Several skills in one repo

Supported, and it's the normal case. Put each skill in its own folder under a discovery container (`skills/kb/`, `skills/setup-kb/`).

- `npx skills add owner/repo --list` lists them.
- `--skill kb --skill setup-kb` installs the named ones.
- `--skill '*'` or `--all` installs all of them.
- With no flags, the CLI shows a picker.

(README "Options", "Examples")

Skills can't share files with each other. Each one is copied on its own, so `setup-kb` can't reach `kb`'s `kb.mjs` by a relative path. It could find it at `~/.agents/skills/kb/kb.mjs` or `.agents/skills/kb/kb.mjs` (the canonical dirs), but that path differs between project and global installs.

## 5. Project vs global, symlink vs copy

| Scope | Flag | Canonical copy | Claude Code link |
| --- | --- | --- | --- |
| Project (default) | none | `./.agents/skills/<name>/` | `./.claude/skills/<name>` -> symlink |
| Global | `-g` | `~/.agents/skills/<name>/` | `~/.claude/skills/<name>` -> symlink |

How `installSkillForAgent` works (`dist/cli.mjs` around lines 2276-2370):

- **Symlink mode (the default):** copy the skill into the canonical dir `<home|cwd>/.agents/skills/<name>`, then create a relative symlink from each agent's dir to it. On Windows it creates a junction. If symlinking fails, it falls back to a copy.
- **Universal agents:** for agents whose skills dir already is `.agents/skills` (Codex, Cline, Warp, Zed, Kimi Code CLI, Pi and others; Amp, OpenCode, Cursor, Gemini CLI and GitHub Copilot use it at project scope), the canonical copy is the install and no link gets created.
- **`--copy`:** writes an independent copy into each agent's dir and creates no canonical copy.
- **Claude Code** (`skillsDir: ".claude/skills"`, `globalSkillsDir: <claudeHome>/skills`, `createProjectSkillsDirByDefault: true`) always gets its project dir created. Other non-universal agents get skipped at project scope if their root dir (e.g. `.windsurf/`) doesn't exist.

Lock files:

- Global: `~/.agents/.skill-lock.json`, or `$XDG_STATE_HOME/skills/.skill-lock.json` when that variable is set. Version 3. It holds `source`, `sourceUrl`, `skillPath`, `skillFolderHash` and timestamps per skill, plus `lastSelectedAgents` (`getSkillLockPath`, around line 3755; local file).
- Project: `./skills-lock.json` (`LOCAL_LOCK_FILE`, around line 1093). It's used to restore project skills into `.agents/skills/`.

Other commands: `skills list|find|remove|update|init|use`, where `update` takes `-g` or `-p` (README "Other Commands").

Local observation: on this machine the older installs (`ask-matt`, `grill-me` and others) are symlinks from `~/.claude/skills/` to `../../.agents/skills/`. Newer mattpocock installs such as `setup-matt-pocock-skills`, `tdd` and `research` are real directories in `~/.claude/skills/` and are missing from `~/.agents/skills/`. That fits a `--copy` install or a copy fallback. The lock still lists them, so expect either layout on users' machines. `${CLAUDE_SKILL_DIR}` handles both.

## 6. Agents it targets

The README lists about 79 agents: "Supports OpenCode, Claude Code, Codex, Cursor, and 75 more". Among them are Amp, Antigravity, Cline, Codex, Continue, Cursor, Droid (Factory), Gemini CLI, GitHub Copilot, Goose, Junie, Kilo Code, Kiro CLI, OpenCode, OpenHands, Qwen Code, Roo Code, Trae, Warp, Windsurf, Zed and more. The README's "Supported Agents" table gives each agent's project and global path. The CLI picks agents automatically from their config dirs (`detectInstalled`) and prompts you if it finds none. `-a claude-code -a codex` or `--agent '*'` pin the choice.

Feature support varies by agent (README "Compatibility"). `allowed-tools` works in most agents, but not Kiro CLI or Zencoder. `context: fork` works only in Claude Code. Hooks work in Claude Code, Cline and Kiro CLI.

This machine last chose: amp, antigravity, antigravity-cli, cline, codex, cursor, deepagents, gemini-cli, github-copilot, kimi-code-cli, opencode, warp, zed, claude-code (`lastSelectedAgents` in `~/.agents/.skill-lock.json`).

## Sources

- npm registry: `npm view skills`, version 1.7.2, repo `git+https://github.com/vercel-labs/skills.git`, bins `skills` and `add-skill`
- `skills@1.7.2` tarball: `README.md`, `dist/cli.mjs` (functions cited inline)
- Claude Code skills docs: https://code.claude.com/docs/en/skills (string substitutions, skill locations, symlinked folders, working directory)
- Agent Skills specification: https://agentskills.io/specification
- Local: `~/.agents/.skill-lock.json`, `~/.agents/skills/`, `~/.claude/skills/` (symlinks), `~/.claude/skills/setup-matt-pocock-skills/`
