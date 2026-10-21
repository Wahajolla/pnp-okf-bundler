# OKF v0.2 spec: precise read

Type: research
Status: resolved
Blocked by: —

## Question

What exactly does OKF SPEC.md v0.2 require and recommend? Required vs optional frontmatter keys and their types/allowed values (`type`, `resource`, `tags`, `sources`, `generated`, `verified`, `status`, `stale_after`, …), bundle/directory conventions, `index.md` auto-generation rules, link conventions, and any validation rules. Also: which parts make sense for *session knowledge* (non-catalog) and what extension mechanism exists for custom keys. Write findings to `.scratch/kb/research/okf-spec.md`.

## Context

Findings: [okf-spec](../research/okf-spec.md)

## Answer

OKF v0.2 is minimal: the only required key is `type` (free text). `title`, `description`, `resource` and `tags` are recommended. Trust and lifecycle keys are all optional: `generated {by, at}`, `verified` (a list of `{by, at}`; the trust tier is derived from it, not stored), `status` (`draft|stable|deprecated`, default `stable`) and `stale_after` (an ISO instant). Each `sources[]` entry requires `resource`. Actor strings take the form `<producer>/<version>`, `human:<id>` or `process:<id>`. `index.md` and `log.md` are reserved names. `index.md` has no frontmatter except an optional `okf_version` in the root one, and generating it is optional. Links from the bundle root are recommended, and broken links must be tolerated. Custom keys are allowed and must be preserved, with no namespace. Conformance is three rules: parseable frontmatter, non-empty `type`, and `index.md`/`log.md` in the correct shape. Implication for `kb.mjs`: its YAML reader must handle inline mappings, both list styles and lists of mappings, and must round-trip unknown keys. Full detail with citations: [okf-spec](../research/okf-spec.md).
