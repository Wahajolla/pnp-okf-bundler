# Build: write SPEC.md

Type: task
Status: resolved
Assignee: wahajolla
Blocked by: —

## Question

Consolidate every decision on the map (01–12 and amendments) into one `SPEC.md` at the repo root. It is the reference the build slices and the two SKILL.md files cite. No new decisions; flag any contradictions found between tickets.

## Answer

Done: [SPEC.md](../../../SPEC.md) consolidates tickets 01–12 and their amendments. One gap was filled during the build: the stemmer also drops a final `e` after suffix stripping (`cache`/`caches` → `cach`), so singular and plural forms match. `--root` is defined as "the bundle dir, or a dir containing `.knowledge/`".
