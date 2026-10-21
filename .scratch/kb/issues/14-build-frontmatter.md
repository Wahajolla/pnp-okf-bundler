# Build: frontmatter reader/writer

Type: task
Status: open
Blocked by: —

## Question

Implement the zero-dependency YAML-frontmatter parser and serializer inside `skills/kb/kb.mjs`, test-first (`/tdd`, node:test). It must handle the shapes in the **OKF v0.2 spec: precise read** ticket: inline mappings, both list styles, lists of mappings. It must round-trip unknown keys and key order, and support `key: null` removal for `update`. Also set up the repo skeleton (`package.json`, `test/`, the main-guard export pattern) from **Build slicing for v1**.
