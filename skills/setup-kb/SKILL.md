---
name: setup-kb
description: Set up the kb knowledge base in this project — scaffold .knowledge/ and wire CLAUDE.md/AGENTS.md so agent sessions find and save knowledge on their own. Use when the user runs /setup-kb, asks to set up or install the knowledge base, or kb reports "no .knowledge/ found".
---

# Set up kb in this project

Run this once per project, from the project root. Re-running it is safe: nothing is overwritten.

The scaffolding itself is done by the **`kb` skill's script**, so load the `kb` skill first. You'll need its `kb.mjs` path. If the `kb` skill isn't installed, stop and tell the user to install both skills (`npx skills add <repo>`).

## 1. Existing bundle?

If `.knowledge/` already exists, tell the user. Run `kb init` (step 3), which only fills in missing files and reindexes. Then skip to step 4.

## 2. Ask two questions, one at a time

Ask each question and wait for the answer before moving on. Offer the default.

1. **"Commit `.knowledge/` to git, or keep it local (gitignored)?"** The default is **commit**: knowledge is shared with the team, and git history is the undo. If the user chooses local, append `.knowledge/` to `.gitignore`, creating the file if needed.
2. **"Keep the default entry types?"** Show them: Decision, Gotcha, How-To, Fact, Overview. The default is **keep**. If the user wants changes, apply them after step 3 by editing `.knowledge/kb.config.json` (`types` → `{ "Name": { "description", "sections": [...] } }`; an optional `"dir"` overrides the folder name).

## 3. Scaffold

```bash
node <kb skill dir>/kb.mjs init
```
It prints a `created …` line for each file. Type folders are created when the first entry is added.

## 4. Wire the instructions file

Pick the target file(s):
- **CLAUDE.md is a symlink to AGENTS.md, or contains `@AGENTS.md`:** AGENTS.md only.
- **Only one of CLAUDE.md / AGENTS.md exists:** that file.
- **Both exist independently:** both.
- **Neither exists:** create CLAUDE.md if you are Claude Code, otherwise AGENTS.md.

In each target, look for `<!-- kb:start -->` … `<!-- kb:end -->`:
- **Markers present:** replace everything between them with the block below. Keep the markers.
- **No markers, but a `## Knowledge base` heading:** show the user that section and ask before replacing it.
- **Otherwise:** append the block at the end of the file, after a blank line.

```markdown
<!-- kb:start -->
## Knowledge base

This project keeps durable knowledge in `.knowledge/` (OKF), managed by the `kb` skill.
- **Find:** at the start of a task, and when you hit a surprising error or face a non-obvious choice, run `kb find <key terms>`. Read relevant hits before relying on them; if the code contradicts an entry, the code wins — fix or flag the entry.
- **Save:** when you learn something a future session would need — and couldn't cheaply rediscover from the code, git or docs — save it with the `kb` skill right away, then mention it in one line.
- Never save task progress, code summaries, or secrets.
<!-- kb:end -->
```

## 5. Report

- List every file created or changed.
- Suggest a first step: "Try `/kb ingest <a doc or README>` to seed it, or just work. I'll save things worth remembering as we go."

No hooks or other automation are installed.
