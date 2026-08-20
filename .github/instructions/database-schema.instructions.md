---
name: database-schema
description: Use when creating a new table/entity, adding a column, or reviewing whether a schema change follows the project's conventions. Also use when deciding how to split data across tables.
---

# Database Schema Conventions

## Core principles (apply to every table)

- **Primary key**: always `UUID`, generated with `gen_random_uuid()`, never an auto-increment integer. This avoids ID collisions when a module is later split into a separate microservice, and prevents ID-guessing when the value is exposed in a URL/API response.
- **Timestamps**: always `TIMESTAMPTZ`, never plain `TIMESTAMP`. Users and servers may be in different timezones; storing timezone-aware timestamps avoids a very common class of bugs.
- **Soft delete over hard delete**: any table holding user-generated content the user might regret deleting (photos, subjects, etc.) gets a nullable `deleted_at TIMESTAMPTZ` column instead of an actual `DELETE`. Hard delete is reserved for rows that are truly disposable (e.g. `refresh_tokens` on logout).
- **Foreign key `ON DELETE` behavior** must be chosen deliberately, not left to default:
  - `ON DELETE CASCADE` when the child row has no meaning without the parent (e.g. `document_chunks` without its `photo`)
  - `ON DELETE SET NULL` when the relationship is optional and losing the parent shouldn't destroy the child (e.g. `photos.subject_id` — a photo should survive even if its subject is deleted)

## Splitting tables: when to keep data together vs. separate

Split a concept into its own table when it has a **different rate of change** or a **different reason to be queried** than its neighbor, even if that means more joins. Concrete example from this project: `ocr_results`, `document_chunks`, and `chunk_embeddings` are three separate tables, not one, because:
- `ocr_results` is the source of truth (raw OCR text) — expensive to regenerate, rarely changes once created
- `document_chunks` can be regenerated from `ocr_results` using a different chunking strategy without re-running OCR
- `chunk_embeddings` can be regenerated from `document_chunks` using a different embedding model without re-chunking

When proposing a new table, state explicitly which of these three change-rate categories it falls into, and whether merging it with an existing table would force unrelated data to be rewritten together.

## Indexing rules

- Add a plain index on every foreign key column that will be filtered on directly (e.g. `idx_photos_user_id`).
- Use a **partial index** (`WHERE condition`) for columns that represent a work queue / job status, where only a small subset of rows is ever queried (e.g. `idx_photos_ocr_status ... WHERE ocr_status IN ('pending','processing')`). This keeps the index small and fast even as the table grows into the millions of rows.
- For vector similarity search (pgvector), default to `hnsw` over `ivfflat`. `ivfflat` requires a minimum amount of data to cluster meaningfully and needs periodic rebuilding; `hnsw` gives better accuracy at a comparable speed and doesn't need that maintenance. Do not add either index until the table has a realistic amount of data — an index on a near-empty table can return incomplete or misleading nearest-neighbor results (this was observed directly during the prototype phase of this project).

## Fields that exist for business/product reasons, not just data modeling

Some columns exist purely to avoid an extra join on a hot path, even though they're technically "denormalized". Example: `subscription_tier`, `storage_quota_bytes`, and `storage_used_bytes` live directly on `users` instead of a separate `subscriptions` lookup, because they're checked on nearly every upload request. When adding a new business-critical check, prefer this pattern over introducing a join if the check will run on a high-frequency code path.

## Before adding a new table or column

1. State which existing table it's related to and via which foreign key.
2. State whether it needs soft delete.
3. State the `ON DELETE` behavior and why.
4. If it stores something that will be searched/filtered often, state what index it needs.
