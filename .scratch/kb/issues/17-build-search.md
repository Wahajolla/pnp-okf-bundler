# Build: search (find)

Type: task
Status: resolved
Assignee: wahajolla
Blocked by: 15

## Question

Tokenizer (compound + parts, diacritic folding), light stemmer, stopwords, BM25F with field weights, `--type`/`--tag` filters, deprecated ×0.5, 30% cutoff, `-n`, excerpt selection, and the header line with status markers and date. Spec: **BM25 search details**, **Output format**, **Staleness and trust lifecycle**. Build a ~30-entry fixture bundle and tune the constants against it.

## Answer

Done: tokenizer, stemmer, stopwords, BM25F, filters, deprecated ×0.5, 30% cutoff, excerpts, and markers plus date in the header.
- Tested against the 25-entry fixture `test/fixtures/entries.mjs`. All 12 ranking queries put the expected entry first with the spec constants as decided, so no tuning was needed.
- Tests in `test/search.test.mjs`.
