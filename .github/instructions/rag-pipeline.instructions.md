---
name: rag-pipeline
description: Use when working on OCR processing, chunking, embedding generation, vector similarity search, or the chat/citation flow that answers user questions from their uploaded photos.
---

# RAG Pipeline

## Data flow (must stay in this order)

```
Photo uploaded
  → OCR runs, result stored in ocr_results (raw_text, confidence_score)
  → raw_text is split into document_chunks (chunk_index, content)
  → each chunk gets exactly one row in chunk_embeddings (embedding vector, model_name)
  → user asks a question in a chat_session
  → question is embedded with the SAME model as the stored chunks
  → pgvector similarity search over chunk_embeddings returns top-k chunks
  → top-k chunk content is assembled into a prompt and sent to the LLM
  → the answer is stored as a chat_message (role=assistant)
  → each source chunk used is recorded in message_citations, linking the message to its chunk_id and photo_id
```

## Why the three tables (ocr_results, document_chunks, chunk_embeddings) stay separate

Each has a different reason to change independently:
- `ocr_results` is expensive to regenerate (requires re-running OCR) — treat it as close to immutable once created.
- `document_chunks` can be regenerated from `ocr_results` alone if the chunking strategy changes (e.g. switching from fixed-length chunks to sentence-aware chunking), without touching OCR.
- `chunk_embeddings` can be regenerated from `document_chunks` alone if the embedding model changes, without re-chunking.

**Rule**: never write code that deletes/regenerates one of these three without a clear reason tied to only that layer changing. If the embedding model changes, only `chunk_embeddings` should be truncated and rebuilt — `ocr_results` and `document_chunks` stay untouched.

## Embedding model consistency

The question embedding and the stored chunk embeddings **must come from the same model and the same output dimensionality**. If the embedding model or `outputDimensionality` config changes, every row in `chunk_embeddings` becomes incomparable to new queries and must be regenerated — there is no way to mix vectors from two different models/dimensions in the same similarity search. Always check `chunk_embeddings.model_name` matches the currently configured embedding model before trusting a search result during debugging.

## Similarity search notes

- Use the `<=>` (cosine distance) operator with pgvector; lower value = more similar.
- Do not add an `ivfflat` or `hnsw` index while the table has only a small number of rows (roughly under a few thousand) — approximate indexes can silently return incomplete/wrong results at low row counts, as observed directly in this project's prototype. Sequential scan is both fast enough and exact at small scale.
- When an index is eventually needed, default to `hnsw` over `ivfflat` for pgvector — better accuracy at comparable speed, no periodic rebuild requirement.

## Chunking

- Chunk size and strategy live in one place (a dedicated chunking service/function), never inlined ad hoc in multiple callers.
- If chunking logic changes, it only affects `document_chunks` (and downstream `chunk_embeddings`, which must be regenerated) — `ocr_results` stays untouched, per the data-flow rule above.

## Citations are not optional

Every assistant `chat_message` that used retrieved context to answer must have corresponding `message_citations` rows pointing to the chunks (and via them, the photos) actually used. This is a core product feature (the answer is traceable back to the source photo), not an optional debug artifact — do not skip writing citations for the sake of a simpler implementation.

## When the answer seems to ignore relevant content that clearly exists

Before assuming the LLM or prompt is at fault, check retrieval first:
1. Query `chunk_embeddings` directly (bypassing the LLM step) to see the actual distance scores and which chunks were retrieved.
2. Confirm the target chunk exists at all and belongs to the expected `photo_id`.
3. Confirm no stale/incompatible index is affecting results (see similarity search notes above).
