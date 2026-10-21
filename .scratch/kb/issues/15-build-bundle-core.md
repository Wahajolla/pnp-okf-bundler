# Build: bundle core

Type: task
Status: resolved
Assignee: wahajolla
Blocked by: 14

## Question

Bundle discovery (walk up, `--root`, `KB_ROOT`); `kb.config.json` loading and default types (5 incl. Overview); type→folder mapping; slug derivation and collisions; lenient addressing; deterministic `index.md` regeneration; inbound link rewrite on move and unlink on delete. Spec: **Bundle layout**, **OKF profile**, **CLI surface**. Unit + fixture-bundle tests.

## Answer

Done: discovery (walk up, `--root`, `KB_ROOT`), config with the 5 default types, type → folder, slugs, lenient addressing, deterministic `index.md` (written only when it changes; emptied folders removed), and link rewrite and unlink that skip code fences. Tests in `test/bundle.test.mjs`.
