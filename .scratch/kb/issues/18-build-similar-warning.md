# Build: similar: warning in add

Type: task
Status: open
Blocked by: 16, 17

## Question

Near-duplicate backstop in `add`: same-type title-token Jaccard ≥ 0.6 (search tokenizer) or the same `resource`, checked against both the bundle and the batch. Warn on stderr, still write, exit 0. Spec: **Deduplication on ingest**.
