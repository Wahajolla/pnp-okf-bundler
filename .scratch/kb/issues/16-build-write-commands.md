# Build: write commands and CLI shell

Type: task
Status: resolved
Assignee: wahajolla
Blocked by: 15

## Question

Implement `init`, `add` (multi-doc stdin), `update` (patch semantics, `--reslug`), `delete`, `types`, `reindex` (incl. `stale:` listing), plus arg parsing, `--json`, `--by`, `--version`, `--help`, exit codes and stderr prefixes. Auto-fill `generated` and `kb_created`. Spec: **CLI surface**, **Output format**, **Agent triggers**, **Staleness and trust lifecycle**, **`/setup-kb` interview and wiring** (for `init`). CLI tests on temp copies of fixture bundles.

## Answer

Done: `init`, `add`, `update` (`--reslug`), `delete`, `types` and `reindex` (including `stale:`), plus `--json`, `--by`, `--version`, `--help`, exit codes 0/1/2 and the stderr prefixes. Tests in `test/commands.test.mjs`, including one that spawns the real CLI with heredoc stdin. `KB_NOW` overrides the clock for tests.
