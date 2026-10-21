# Build: write commands and CLI shell

Type: task
Status: open
Blocked by: 15

## Question

Implement `init`, `add` (multi-doc stdin), `update` (patch semantics, `--reslug`), `delete`, `types`, `reindex` (incl. `stale:` listing), plus arg parsing, `--json`, `--by`, `--version`, `--help`, exit codes and stderr prefixes. Auto-fill `generated` and `kb_created`. Spec: **CLI surface**, **Output format**, **Agent triggers**, **Staleness and trust lifecycle**, **`/setup-kb` interview and wiring** (for `init`). CLI tests on temp copies of fixture bundles.
