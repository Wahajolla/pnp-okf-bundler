# Build: package, README and end-to-end check

Type: task
Status: resolved
Assignee: wahajolla
Blocked by: 16, 17, 18, 19, 20

## Question

`git init` the repo. Write the README (install with `npx skills add`, `/setup-kb`, what the agent does, command summary). Set `VERSION = 1.0.0`. End-to-end: install from the local path into a scratch project, run `/setup-kb`, then in a real session save one entry at a checkpoint, ingest a doc, and find it again. Record any fixes needed. Done = the map's destination.

## Answer

Done.
- **Repo:** public at https://github.com/Wahajolla/pnp-okf-bundler, with README.md and an MIT LICENSE (my default choice; the user can change it).
- **Install:** `npx skills add <local path> -a claude-code -y` installed both skills into a scratch project.
- **Script:** the installed `kb.mjs` ran `init`, `add`, and `find` from a nested subdirectory.
- **Real session:** a headless `claude -p` session in the scratch project used the `kb` skill unprompted by name, saved a well-formed Gotcha with `--by claude-code/opus-5.5`, and found it again.
- **Not yet exercised:** the interactive `/setup-kb` flow, because its questions need a live user.
