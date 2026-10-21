# Build: frontmatter reader/writer

Type: task
Status: resolved
Assignee: wahajolla
Blocked by: —

## Question

Implement the zero-dependency YAML-frontmatter parser and serializer inside `skills/kb/kb.mjs`, test-first (`/tdd`, node:test). It must handle the shapes in the **OKF v0.2 spec: precise read** ticket: inline mappings, both list styles, lists of mappings. It must round-trip unknown keys and key order, and support `key: null` removal for `update`. Also set up the repo skeleton (`package.json`, `test/`, the main-guard export pattern) from **Build slicing for v1**.

## Answer

Done in `skills/kb/kb.mjs` (`parseYaml`, `parseDoc`, `serializeDoc`), with tests in `test/frontmatter.test.mjs`.
- The frontmatter is split into top-level chunks. A key whose value is unchanged is written back byte-for-byte (comments and odd formatting kept); changed or new keys are re-serialized.
- Supported: block and flow maps and lists, lists of maps, quoted and plain scalars, `|`/`>` block scalars, comments.
- Repo skeleton: `package.json` (`npm test` = `node --test`), and `main()` only runs when the file is executed directly.
