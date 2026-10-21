# `/setup-kb` interview and wiring

Type: grilling
Status: resolved
Assignee: wahajolla
Blocked by: 08

## Question

What exactly does `/setup-kb` do when it runs in a project? Which questions does it ask (commit vs gitignore `.knowledge/`, which default types to keep, anything else)? How does it detect CLAUDE.md vs AGENTS.md (both, neither, a symlink between them) and place or refresh the `## Knowledge base` section (draft wording fixed in **Agent triggers**) idempotently on re-runs? Should it offer an opt-in PreCompact/Stop hook that prompts a save sweep (Claude Code only; ruled out of v1 defaults in **Agent triggers**)? What does it do if `.knowledge/` already exists?

## Answer

Resolved AFK: the user asked for the recommended option at every fork.

**Scaffolding goes through a new `kb init` command.** This amends **CLI surface**.
- `/setup-kb` can't share files with the `kb` skill, because installed skills are self-contained. So the default config lives only in `kb.mjs`, and `/setup-kb` tells the agent to run `kb init` through the `kb` skill.
- `kb init [--root <dir>]` creates `.knowledge/` in the current directory: `kb.config.json` with the 5 default types, and the root `index.md` (`okf_version: "0.2"`). Type folders are created lazily.
- It prints `created .knowledge/kb.config.json` and `created .knowledge/index.md`.
- If a bundle already exists, it creates only the missing files and then runs a reindex. It never overwrites, and exits 0.

**What the skill does, in order:**
1. **Check for an existing bundle.** If `.knowledge/` exists, it says so and runs `kb init`, which only fills gaps and reindexes. It skips question 2 and goes straight to wiring.
2. **Ask two questions**, one at a time, each with a default:
   - **Commit or gitignore `.knowledge/`?** The default is **commit**, because knowledge is shared with the team and git is the undo. If the user picks gitignore, the skill appends `.knowledge/` to `.gitignore`.
   - **Keep the default types?** It shows the 5 defaults (Decision, Gotcha, How-To, Fact, Overview). The default answer is **keep**. Otherwise the user can drop, rename or add types, and the agent edits `kb.config.json` afterwards.
3. **Run `kb init`.**
4. **Wire the instructions file:**
   - **Only CLAUDE.md or only AGENTS.md exists:** write to that file.
   - **CLAUDE.md is a symlink to AGENTS.md, or contains `@AGENTS.md`:** write to AGENTS.md only.
   - **Both exist independently:** write to both.
   - **Neither exists:** create CLAUDE.md when running in Claude Code, otherwise AGENTS.md.
   - **Idempotence:** the section from **Agent triggers** is wrapped in `<!-- kb:start -->` … `<!-- kb:end -->` markers. A re-run replaces the text between the markers. If there's a `## Knowledge base` heading without markers, the skill asks before replacing it.
   - **Placement:** the section is appended at the end of the file.
5. **Report.** It lists the files created or changed, and suggests a first step: "try `/kb ingest <a doc>` or just work — I'll save as we go".

**No hooks offered**, not even as an opt-in. PreCompact/Stop hooks are beyond v1; see Out of scope on the map.
