# Retrieval and indexing plan

## Working baseline

The preview is retrieval infrastructure for an agent, not a bundled language model. A request reads the scoped raw Markdown, applies Rhen and tag filtering, then uses heading-aware chunks with a roughly 1,800-character bound. Content hashes reuse unchanged parsed notes. BM25-style scores use query term frequency and corpus document frequency; titles, headings and aliases are included. A bounded portion of the result budget can contain one-hop links/backlinks. Each hit carries vault/path, line range, content revision and why it was selected.

`maxChars` bounds excerpt text; it is not a tokenizer-exact budget, and JSON metadata adds overhead. `maxResults` bounds result count. Read operations cap body text at 40,000 characters. Local scanning rejects oversized files (>1 MB), excessive vault entries (>30,000), depth (>40), and excessive in-scope text (>32 MB) rather than silently returning an incomplete index.

Every query validates raw disk content again. This prevents an old in-memory plaintext parse from being served after a note is sealed, deleted or changed. The tradeoff is an O(scoped bytes) scan. This is a correctness baseline, **not yet an optimized large-vault engine**. `npm run benchmark` measures a synthetic local baseline. Do not extrapolate it to a production vault.

## Target optimized engine

Use an embedded SQLite database with WAL, FTS5 and a pluggable local vector backend. Prove packaging on Windows/macOS/Linux before committing to a native vector dependency. Separate identities and revisions:

- Documents: vault ID, canonical note identity, path, content revision, parser version, policy revision, source timestamp, deletion tombstone.
- Chunks: heading/block anchor, line range, chunk hash, language, source document revision.
- Embeddings: chunk hash, model ID, model revision, dimension, normalization, provider locality.
- Graph edges: source, target, link kind, heading/block target, resolution confidence, graph revision.
- Workspace membership: profile hash, document ID, policy epoch and write capability.

Keep private plaintext/embeddings outside repositories. The safest first persistent implementation partitions indexes by approved profile and policy hash. Only introduce cross-profile deduplication after ACL-filtered candidate generation is proven; never search a global vector corpus and filter only after ranking. Shared embeddings can leak semantic facts, so encryption at rest and deletion semantics need the same care as source text.

An ingestion queue coalesces filesystem and Obsidian events by note identity. Reindex only changed chunks. Handle save storms, rename, delete, merge, vault removal and policy changes. Use a single index writer, transactional generations, bounded worker queues, cancellation and periodic reconciliation for dropped watcher events. On policy uncertainty, fail closed and evict affected plaintext, vectors, graph metadata and cached responses.

Rhen lock changes must be priority invalidations, independent of a note's mtime. A trustworthy live policy revision/event contract is needed to make incremental validation as reliable as the preview's fresh reads. TTL alone cannot guarantee revocation. A policy check must also occur immediately before emitting results.

## Hybrid query pipeline

1. Bind workspace and profile revision, then resolve the allowed document set.
2. Retrieve BM25 and vector candidates only from authorized documents.
3. Fuse ranks, deduplicate chunks and optionally rerank locally.
4. Expand selected graph neighbors to a bounded depth, retaining the same policy.
5. Allocate a token budget by source diversity, relevance and task intent; retain exact citations.
6. Revalidate revision and policy before returning. Return explicit stale/retry errors.

Use local embedding models by default. A remote provider requires a deliberate setting showing which text leaves the machine. Persist embedding model metadata and reindex on version/dimension changes. The `EmbeddingProvider` interface is an extension point; no embedding provider is shipped yet.

## Evaluation gates

Build a synthetic and opt-in curated question set covering exact identifiers, conceptual queries, synonyms, acronyms, linked rationale, stale notes, duplicate titles and multiple vaults. Measure Recall@k, nDCG, citation accuracy, context size, cold/warm p50/p95 latency, CPU/memory, index size and update-to-search lag. Report ranking quality separately from the downstream model's answer quality.

Hard gates: zero cross-profile retrieval, zero sealed plaintext results, no deleted/renamed stale results, bounded memory, reproducible citations, and successful cancellation. Performance targets are proposed acceptance criteria, not measurements: warm p95 below 300 ms on a documented 10k-note fixture; one-note update below 2 s; no foreground editor blocking during bulk indexing. Tune only after the correctness tests pass.

## Graph fidelity

The offline parser supports common wiki links, embeds, Markdown links, aliases and headings. It ignores links in code. It does not perfectly reproduce Obsidian's resolution for all ambiguous paths, reference-style links, plugins, block references or Canvas. The Obsidian companion uses `MetadataCache.resolvedLinks` for its native neighbor command, filtered through the allowed note set. A future event adapter should use native resolution as authoritative while preserving a deterministic offline fallback. Never import the whole metadata cache into a model-visible graph before filtering.
