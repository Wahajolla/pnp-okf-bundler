# BM25 search details

Type: grilling
Status: resolved
Assignee: wahajolla
Blocked by: 03

## Question

How does search work? Tokenizer (incl. code identifiers like `camelCase`/`snake_case`/paths), stemming or not, stopwords, field weighting (title/tags vs body), BM25 parameters, filters (by type/tag/status), and live scan per query vs cached index. (Output format fixed: default 5 hits, `-n`, ~30% relative score cutoff to tune here; excerpt selection reuses the search tokenizer.)

## Answer

**Index: live scan, no cache.** Every `find` reads, tokenizes, and scores the bundle in memory. IDF is computed over the whole bundle each query, so it's always current. Nothing is stored, so there's nothing to invalidate after hand edits, `git pull` or a branch switch. A cache could be added later behind the same interface if a bundle ever gets slow.

**Tokenizer.** One tokenizer is shared by queries, entries, and excerpt scoring (see **Output format**).
1. NFKD, lowercase, combining marks stripped (diacritic folding). Non-Latin scripts are kept.
2. Split on `[^\p{L}\p{N}_./-]`. Each chunk is a *compound* token (`vi.mock`, `snake_case`, `src/utils/foo.ts`, `--reslug`). A trailing `.` or `-` is trimmed.
3. Expand each compound into *parts*: split on `_ . / -`, on camelCase and acronym boundaries (`parseJSONFile` → `parse json file`, `XMLHttpRequest` → `xml http request`), and on letter↔digit boundaries (`utf8` → `utf 8`).
4. Emit the whole compound **and** its parts, so an exact identifier query gets a double hit.
5. Drop single-character tokens unless they are digits.

**Stemming: light English suffix stripping.** Handles `-s`, `-es`, `-ies→y`, `-ing`, `-ed` and `-ly`, with a minimum stem of 3 characters. It applies only to all-lowercase Latin parts and plain words, never to compounds, so identifiers stay exact. Entries are assumed to be English. Other scripts are tokenized but not stemmed.

**Stopwords.** A fixed list of about 40 English words: articles, pronouns, auxiliaries, prepositions, question words, `and`/`or`/`not`. They're removed from parts and plain words, in queries and documents alike, after expansion and before stemming. Compounds are never affected (`path_to_file` is kept, while the part `to` is dropped). If a query is all stopwords, its raw tokens are used. The list isn't configurable in v1.

**Scoring: simplified BM25F, saturated once.**
```
tf'(t,d) = Σ_field w_field × tf(t, field)
len'(d)  = Σ_field w_field × len(field)
score    = Σ_t IDF(t) × tf'·(k1+1) / (tf' + k1·(1 − b + b·len'/avglen'))
```
Field weights:

| Field | Weight |
|---|---|
| `title` | 3 |
| `tags` | 2.5 |
| `description` | 2 |
| `resource` + `sources[].resource` | 1.5 |
| body (including headings) | 1 |

`type` is not indexed as text. `k1=1.2`, `b=0.75`. The weights, `k1`, `b` and the cutoff ratio are script constants, tuned during the build against a fixture bundle and not exposed in `kb.config.json`.

**Query semantics.** Plain OR: every token contributes, and an entry doesn't need to match all of them. Query tokens are deduplicated after normalization. There's no syntax (no quotes, phrases, `+`/`-` operators or `field:` prefixes; quotes are stripped) and no prefix or fuzzy matching.

**Filters**
- `--type <T>` is repeatable or comma-separated and OR'd. Matching is case-insensitive. An unknown type produces `warn:` with the known list, and the search still runs.
- `--tag <t>` is repeatable and AND'd. Matching is exact and case-insensitive.
- Filters apply before scoring and cutoff. IDF stays bundle-wide.
- There's no `--status` flag. Status handling (hide, down-rank, flag, filter) is left to **Staleness and trust lifecycle**.
- A query is required. `find` with no query words is a usage error (exit 2) with the hint to read `index.md`.

**Scan scope.** Exactly the bundle directory, recursively: every `*.md` except the OKF-reserved `index.md` and `log.md` at any level. Nothing outside the bundle is scanned, and nothing inside it is skipped specially.
- If an entry's frontmatter won't parse or has no `type`, it is skipped with `warn: <path> unparseable frontmatter — run 'kb reindex'` on stderr, and `find` still exits 0.
- If an entry is missing `title` or `description`, it is still searched. The slug stands in for the title and the description is empty.

**Ranking and cutoff.** Sort by score descending, with ties broken by path ascending (deterministic). Keep hits scoring ≥ 30% of the top hit, then take the first `-n` (default 5). There's no absolute score floor: a weak best hit is still shown, and the agent judges it by reading.

**Amended by [Staleness and trust lifecycle](10-staleness-trust.md):** a deprecated entry's score is multiplied by 0.5 before the cutoff.
