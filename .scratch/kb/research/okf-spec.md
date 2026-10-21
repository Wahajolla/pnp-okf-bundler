# OKF v0.2 spec: precise read

Researched 2026-10-17 against `GoogleCloudPlatform/open-knowledge-format` at commit
`ad30107c31c06aec8a7d5636e0d1058118604e6f` (main, 2026-08-21). Citations as `[S §N, Lx]`
link to line ranges of SPEC.md at that commit. Sample-bundle and reference-code citations
use the same commit.

- S = [SPEC.md](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/ad30107c31c06aec8a7d5636e0d1058118604e6f/SPEC.md)
- IDX = [src/reference_agent/bundle/index.py](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/ad30107c31c06aec8a7d5636e0d1058118604e6f/src/reference_agent/bundle/index.py) (reference index generator)
- DOC = [src/reference_agent/bundle/document.py](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/ad30107c31c06aec8a7d5636e0d1058118604e6f/src/reference_agent/bundle/document.py) (reference parser/validator)
- PATHS = [src/reference_agent/bundle/paths.py](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/ad30107c31c06aec8a7d5636e0d1058118604e6f/src/reference_agent/bundle/paths.py)
- ACME = [bundles/acme_retail/](https://github.com/GoogleCloudPlatform/open-knowledge-format/tree/ad30107c31c06aec8a7d5636e0d1058118604e6f/bundles/acme_retail), GA4 = [bundles/ga4/](https://github.com/GoogleCloudPlatform/open-knowledge-format/tree/ad30107c31c06aec8a7d5636e0d1058118604e6f/bundles/ga4)

Normative keywords (MUST/SHOULD/MAY) are quoted as the spec uses them. The README calls the
reference agent "a proof of concept demonstrating *one* way to produce OKF bundles", so its
behaviour is evidence of intent, not normative.

## TL;DR

- **The only required key is `type`** (a non-empty string). A file with only `type` is fully conformant [S §4.1 L175-188, §11 L738-744].
- **Conformance has three rules:** every non-reserved `.md` has parseable YAML frontmatter, every frontmatter has a non-empty `type`, and `index.md`/`log.md` follow §8/§9 [S §11 L738-744].
- **Consumers are lenient by mandate.** They MUST NOT reject a bundle for missing optional fields, unknown `type` values, unknown keys, broken links, or missing `index.md` [S §11 L755-762].
- **Extension needs no mechanism.** Producers MAY add any keys. Consumers SHOULD preserve unknown keys when round-tripping and MUST NOT reject them. There is no namespace or prefix rule [S §4.1 L205-207].
- **`index.md` carries no frontmatter**, except that a bundle-root `index.md` MAY carry `okf_version`. Its body is `# Heading` sections of `* [Title](link) - description` bullets [S §8 L507-529].
- **Timestamps are ISO 8601 datetimes with an explicit UTC offset** [S §5 L284-285].

## 1. Frontmatter keys

General shape: a YAML block opened by `---` on the file's first line and closed by `---` on its own line. Files are UTF-8 [S §4 L155-159].

### 1.1 Core keys [S §4.1 L161-207]

| Key | Status | Type / allowed values | Notes |
|---|---|---|---|
| `type` | **REQUIRED** | Non-empty string. Free text, not registered centrally | Examples: `BigQuery Table`, `API Endpoint`, `Metric`, `Playbook`, `Reference`, `Attested Computation`. Producers SHOULD pick descriptive values. Consumers MUST tolerate unknown types and treat them as generic concepts [L177-185]. |
| `title` | Recommended | string | If omitted, consumers MAY derive it from the filename [L192-193]. |
| `description` | Recommended | string, "a single sentence" | Used by index generators, search snippets, and previews [L194-195]. |
| `resource` | Recommended | URI string (path-valued, see §3.2) | Uniquely identifies the underlying asset. Absent for abstract concepts [L196-198]. |
| `tags` | Recommended | YAML list of short strings | Cross-cutting categorization [L199]. Flow (`[a, b]`) and block (`- a`) lists both appear in the samples (ACME `metrics/revenue.md`, GA4 `references/metrics/purchasers.md`). |
| *(anything else)* | Optional | any | See §6 Extensions. |

### 1.2 Provenance: `sources` and `usage_window` [S §5.1 L287-364]

`sources` is a list of entries:

| Entry key | Status | Type | Notes |
|---|---|---|---|
| `resource` | **REQUIRED within an entry** | string | Either a followable artifact (absolute URL, bundle-relative path, or a path into `references/`) or a scope descriptor that can't be followed, e.g. `all queries in BigQuery project X` [L305-308]. |
| `id` | Optional; SHOULD be present when the body cites the source | string, stable key | The join key for footnote attribution [L309-310]. |
| `title` | Optional | string | [L311] |
| `author` | Optional credibility signal | actor string (§4 below) | An authority signal [L322-323]. The samples also use `team:<id>` (e.g. `team:finance-fpa`, S L944), a prefix that §7 does not define. |
| `usage_count` | Optional credibility signal | integer | How often the source was exercised over `usage_window`. Read it as liveness and trend, not as a score [L324-341]. |
| `last_modified` | Optional credibility signal | ISO 8601 datetime | When the source itself changed. This is distinct from `generated.at` [L329-331]. |
| `usage_window` | Optional, per entry | `{ from, to }` | Overrides the shared window for that entry [L332-334]. |

- `usage_window` is a **top-level sibling of `sources`**, shaped `{ from: <datetime>, to: <datetime> }`. It frames every `usage_count` [L300, L332-334].
- OKF stores signals, not a credibility score [L315-320].
- **Per-claim attribution** uses a markdown footnote whose label equals a `sources[].id`, for example `...[^ga4-schema]` paired with `[^ga4-schema]: GA4 BigQuery Export schema`. Consumers resolve attribution through the matching entry, never by parsing the footnote prose. Labels are keyed rather than positional so they survive reordering [L350-364].
- **Lineage** is expressed by pointing `resource` at another concept; no dedicated field exists. `derived_from` is out of scope for v0.2 [L343-348].

### 1.3 Trust: `generated` and `verified` [S §5.2-5.3 L366-410]

| Key | Shape | Rules |
|---|---|---|
| `generated` | mapping `{ by, at }` | `by` is **REQUIRED within `generated`** and is an actor. `at` is an ISO 8601 datetime for the content's last meaningful change [L377-380]. It supersedes v0.1 `timestamp` (consumers MAY fall back to it) [S §13.1 L805-808]. |
| `verified` | list of `{ by, at }`, or a single bare mapping | Each event has `by` (actor) and `at` (datetime). Multiple entries record independent checks, and the latest `at` is "how recently" [L388-391]. Consumers MUST treat a bare mapping as a one-element list [L394-398, §11 L749]. It is independent of `generated.at` [L392-393]. |

**Trust tiers** are derived and never stored [L403-407]:
- no `verified` key: **unverified**
- `verified` only by non-`human:` actors: **machine-confirmed**
- any `verified` by a `human:<id>` actor: **human-reviewed**

Tiers are advisory, not access control, and an absent tier MUST NOT cause rejection [L409-410].

### 1.4 Lifecycle: `status` and `stale_after` [S §5.4-5.5 L412-433]

| Key | Type | Allowed values / semantics |
|---|---|---|
| `status` | enum string | `draft` (not reviewed, possibly incomplete), `stable` (ready, the default), `deprecated` (kept for links and history, no longer current). **Absent means `stable`** [L414-422]. |
| `stale_after` | ISO 8601 datetime with offset | An absolute instant. The concept is stale when `now >= stale_after`. The spec deliberately chose an absolute instant over a relative TTL [L427-433]. |

The reference implementation **ignores** a date-only `stale_after` such as `2026-12-31`, or one without an offset, rather than guessing a timezone (DOC `is_stale`). It also loads YAML with the timestamp resolver disabled, so datetimes round-trip byte-for-byte as strings (DOC `_Loader`).

### 1.5 Attested Computation keys (only for `type: Attested Computation`) [S §10.2 L584-608]

- `runtime`: **REQUIRED for this type**, e.g. `bigquery`, `postgres`, `dbt`, `python`, `Looker`.
- `parameters`: a list of `{ name, type, required }`.
- `computation`: an optional path to a file. When absent, the body's `# Computation` fence is the computation.
- `executor`: `{ resource, receipt: [field, ...] }`.
- `attester`: `{ resource }`, pointing at deterministic code that uses no LLM.

The agent MAY only supply parameter values. It MUST NOT author or edit the computation [S §10.3 L662-663]. This family is irrelevant for `kb`.

### 1.6 Version declaration

`okf_version: "0.2"` MAY appear only in the **bundle-root `index.md`** frontmatter. Consumers that don't understand the declared version SHOULD attempt best-effort consumption [S §12 L776-780, §8 L512-513]. None of the four sample bundles declares it (ACME root `index.md` has no frontmatter).

## 2. Bundle and directory conventions [S §3 L109-149]

- A bundle is a directory tree of `.md` files. Its layout is domain-independent, and producers organize it however they like [L111-113].
- A bundle can be distributed as a git repo (recommended), a tarball or zip, or a subdirectory of a larger repo [L127-132].
- **Reserved filenames** at any level are `index.md` (§8) and `log.md` (§9). They MUST NOT be used for concepts, and every other `.md` is a concept [L134-144].
- **Concept ID** is the file's path within the bundle without the `.md` suffix [S §2 L79-80]. The reference code restricts ID segments to `[A-Za-z0-9_][A-Za-z0-9_.\-]*` (PATHS `_SEGMENT_RE`). The spec has no such rule.
- No separate tag-index file format exists. Consumers synthesize tag views by scanning frontmatter [L146-149].
- `references/` is a naming convention, not a requirement, for mirroring external material, run instructions, or code as concepts [S §6.3 L479-485].
- Non-`.md` files may live in the bundle. ACME keeps `attesters/sql_equality.py` and a `viz.html` per bundle. The spec does not address them, and only `.md` files are subject to conformance.

### 2.1 Body [S §4.2 L209-225]

- There are no required sections. Producers SHOULD favour structural markdown (headings, lists, tables, fences) over prose.
- Conventional headings, which SHOULD be used when applicable: `# Schema`, `# Examples`, `# Computation`.
- v0.1's `# Citations` body list is superseded by `sources`. Consumers MAY still parse it for v0.1 docs [S §13.1 L809-811].

### 2.2 `log.md` [S §9 L533-552]

- MAY appear at any level and records changes for that scope.
- Entries are flat and grouped by date, **newest first**. Date headings **MUST** be ISO `YYYY-MM-DD` (`## 2026-05-22`).
- Entries are prose. A leading bold word (`**Update**`, `**Creation**`, `**Deprecation**`) is a convention, not a requirement.
- Sample deviation: ACME `log.md` carries frontmatter (`type: Log`). §9 neither requires nor forbids this, but the reference index generator would then list it as a concept (see §5).

## 3. Links and paths [S §6 L437-477]

### 3.1 Concept-to-concept links

Links are standard markdown links in two forms:
- **Bundle-absolute** (`/tables/customers.md`), resolved from the bundle root. This is the **recommended** form because it stays stable when a document moves within its subdirectory [L444-450].
- **Relative** (`./other.md`, `../computations/revenue.md`) [L452-456].

Other rules:
- A link asserts an untyped relationship. The kind of relationship comes from the surrounding prose, and graph consumers treat all links as directed untyped edges [L458-462].
- Consumers **MUST tolerate broken links**. A missing target may be knowledge that hasn't been written yet [L464-466].
- The samples mostly use relative links (`../computations/revenue-ytd.md`, `./gross-margin.md`), despite the recommendation.

### 3.2 Path-valued fields [L468-477]

These fields are path-valued: `resource`, `sources[].resource` (unless it is a scope descriptor), `computation`, `executor.resource`, and `attester.resource`. Each accepts an absolute URL, a `/`-prefixed bundle path, or a relative path. Samples also use bare paths without `./` or `/`, such as `policies/revenue-recognition.md` and `references/skills/run-on-bq.md` (ACME `metrics/revenue.md`, S L620). The spec doesn't say what a bare path is relative to.

### 3.3 Actor convention [S §7 L489-501]

Used by `generated.by` and `verified[].by`:
- `<producer>/<version>` for agents and tools, e.g. `reference_agent/gemini-2.5-pro`
- `human:<id>` for people
- `process:<id>` for automated processes

Producers **MUST** use `human:` for hand-authored or human-confirmed content, because trust tiers key off that prefix.

## 4. `index.md` rules [S §8 L505-529]

### 4.1 Normative

- An `index.md` MAY appear in any directory, including the root. Its purpose is progressive disclosure.
- No frontmatter is allowed, except `okf_version` in the root index.
- The body is one or more sections, each a `# Heading` followed by bullets:
  ```
  # Section / Group Heading

  * [Title 1](relative-url-1) - short description of item 1

  # Another Section

  * [Subdirectory](subdir/) - short description of the subdirectory
  ```
- Entries SHOULD include the linked concept's frontmatter `description`.
- Producers MAY auto-generate `index.md`, and consumers MAY synthesize one on the fly when it is absent. A missing index is never grounds for rejection [S §11 L762].

### 4.2 What the reference generator actually does (IDX `regenerate_indexes`)

- It indexes every directory that contains a `.md` file anywhere beneath it, deepest first, so child directory descriptions exist before their parents are written.
- For each directory it skips `index.md` and lists **every other `.md`**. Nothing excludes `log.md`.
- Files whose frontmatter fails to parse are silently skipped.
- Each file entry is `(type, title or file stem, filename, description or "")`. Each subdirectory entry is `("Subdirectories", dirname, "dirname/index.md", dir description)`.
- **Sections are grouped by `type`**, with the section heading being the literal type value and `Other` used when `type` is empty. Sections sort alphabetically by heading, and entries sort by lower-cased title.
- The line format is `* [Title](link) - desc`. The ` - desc` suffix is omitted when empty.
- A subdirectory's description is the single child's description when the directory has exactly one described entry. Otherwise an **LLM synthesizes** one from the (title, desc) pairs. The bundle root gets no description.
- It never writes `okf_version`.
- Subdirectory links point to `subdir/index.md`. The spec example uses `subdir/`.
- The samples confirm the output: ACME root index is a single `# Subdirectories` section, `metrics/index.md` is a single `# Metric` section, and GA4 `references/metrics/index.md` is `# Reference`. ACME `attesters/index.md` lists a `.py` file, so it was hand-edited, since the generator only enumerates `.md` and directories.

## 5. Validation and conformance [S §11 L736-762]

**MUST hold for a conformant bundle:**
1. Every non-reserved `.md` contains a parseable YAML frontmatter block.
2. Every frontmatter has a non-empty `type`.
3. `index.md` and `log.md`, when present, follow §8 and §9. Concretely: no index frontmatter except root `okf_version`, and log date headings in `YYYY-MM-DD`.

**Consumer obligations when the optional families are present:**
- MUST treat a bare `verified` mapping as a list.
- MUST NOT reject for missing optional families.
- SHOULD derive tier and staleness only from the spec's fields.
- SHOULD surface failing attestations rather than drop them.

**Consumers MUST NOT reject** a bundle for any of these:
- missing optional fields
- unknown `type` values
- unknown keys
- broken cross-links
- missing `index.md`

All other constraints are "soft guidance".

**Producer SHOULDs** worth linting as warnings, not errors:
- `description` is one sentence.
- `sources[].id` is present when the body cites it.
- Every footnote label matches a `sources[].id`.
- `sources[].resource` is present (it is REQUIRED within an entry).
- `generated.by` is present when `generated` exists (also REQUIRED within it).
- `status` is in the enum.
- Timestamps carry an offset.
- Actors use the prefixes `human:`, `process:`, or `x/y`.

**Reference validator** (DOC `validate`) checks only that `type` is truthy. Its parser treats a file with no leading `---` as having empty frontmatter rather than raising. It does raise on an unterminated block, invalid YAML, or non-mapping frontmatter.

## 6. Extension mechanism

There is none beyond permissiveness [S §4.1 L205-207]:
- Producers MAY include any additional keys.
- Consumers SHOULD preserve unknown keys on round-trip and MUST NOT reject them.
- There is no `x-` prefix, namespace, or schema registry. The spec says "no schema registry, no central authority" [S L11-13].

Body sections and `type` values are open in the same way. Future spec versions add fields only through minor bumps, which are backward-compatible optional additions [S §12 L768-774]. So a custom key could collide with a future spec key, and nothing reserves a namespace. The spec does not address this risk (inference).

---

## 7. Applying it to a per-project session-knowledge base (ANALYSIS, NOT SPEC)

> Everything in this section is my interpretation for `kb` (`.knowledge/`, agent-written decisions, gotchas, and how-tos). It is not stated by the spec.

**Adopt as-is (cheap, and directly useful to agents):**
- **`type` as the routing key.** Use a small fixed vocabulary such as `Decision`, `Gotcha`, `How-To`, and maybe `Reference`. It is free text per spec, so `kb` can enforce its own enum while staying conformant.
- **`title`, `description`, `tags`.** `description` doubles as the BM25 snippet and the `index.md` line, so make `kb ingest` require it even though the spec only recommends it.
- **`generated: { by, at }`** with actors like `claude-code/opus-4` or `human:<id>`. `generated.at` is the natural "last updated" field for `kb update`.
- **`status` (`draft | stable | deprecated`).** It fits superseded decisions well. Keep deprecated files, as ACME `gross-margin-legacy.md` does, and have `find` down-rank or filter them. Absent means `stable`.
- **`sources`** with `resource` pointing at repo files, commits, PR or issue URLs, or a scope descriptor ("session 2026-10-17"), plus `id` for footnote attribution. This answers "why do we believe this gotcha".
- **`verified` and trust tiers.** A human confirming an agent-written gotcha flips it to human-reviewed. That is a useful ranking boost and costs nothing.
- **Reserved `index.md` and `log.md`, bundle-absolute links, and broken-link tolerance.** A `log.md` with `## YYYY-MM-DD` entries is a natural audit trail for `ingest`/`update`/`delete`.
- **Directory-per-type layout** (`decisions/`, `gotchas/`, `how-to/`). It mirrors the samples, and the reference generator's group-by-`type` sections then stay one-section-per-directory.

**Adopt with care:**
- **`stale_after`.** It is useful for gotchas tied to dependency versions. It must be a full datetime with an offset, and a date-only value is ignored by the reference implementation. `kb` could default it on ingest for volatile types only.
- **`resource`.** For a session KB most concepts are abstract. Use it only when a concept is about one file or symbol, e.g. a repo-relative path. Concepts about abstract ideas should omit it, per spec.
- **`index.md` generation.** Follow the spec format but skip the reference generator's LLM step. `kb` is zero-dependency, so derive directory descriptions deterministically or leave them blank. Exclude `log.md` from listings, unlike the reference code, and write root `okf_version: "0.2"` so the bundle self-describes.

**Skip:**
- **Attested Computation** (`runtime`, `parameters`, `executor`, `attester`, `# Computation`). It is data-catalog machinery with no analogue here.
- **`usage_count` / `usage_window`.** These are optional and catalog-oriented. If `kb` wants hit counts for ranking, storing them in frontmatter means rewriting files on every read (git churn). Keeping them out of the bundle seems better.
- **`# Schema` conventional heading.** Not applicable. For bodies, prefer `kb`'s own conventional headings, e.g. `# Context`, `# Decision`, `# Consequences` for decisions, or `# Symptom`, `# Cause`, `# Fix` for gotchas. The spec permits any headings.

**Custom keys for `kb`:**
- Allowed freely by §4.1, e.g. `supersedes: /decisions/foo.md` or `applies_to: [src/**]`.
- `kb update` must **preserve unknown keys** (SHOULD) and must round-trip timestamps as written.
- A zero-dependency `.mjs` YAML reader therefore needs to handle at least flow mappings (`{ by: x, at: y }`), flow and block lists, and lists of flow mappings, since all three appear in spec examples.
- Consider prefixing custom keys (e.g. `kb_`) to avoid future-spec collisions. The spec gives no guidance on this.
