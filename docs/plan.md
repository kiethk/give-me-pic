# Give Me Pic — Development Plan

> This is a living document. Update `## Current Status`, `## Completed`,
> `## In Progress`, and `## Not Started` as work progresses. Any change to
> `## Locked-in Decisions` requires explicit user confirmation first.

## Current Status

Phase: 1 — Auth + Media MVP
Last updated: 2026-08-19

## Completed

- [x] Repo structure decided: monorepo, `backend/` + `frontend/` + root `docker-compose.yml`
- [x] Full database schema drafted (see below) for all 4 modules: auth, subject, media, RAG
- [x] Auth module (backend): `User` entity, `POST /api/auth/register`, `POST /api/auth/login`
- [x] JWT auth working end-to-end via httpOnly cookie + CORS
- [x] Next.js frontend scaffolded (App Router, TypeScript, Tailwind), production build passes
- [x] Subject module (backend): `Subject` entity, CRUD endpoints
- [x] Media module (backend): `Media` entity, upload endpoint to MinIO, list endpoint
- [x] Phase 2: RAG Pipeline (OCR, Chunking, Embedding, Similarity search, POST /api/chat)
- [x] Phase 2: Frontend chat UI with citations
- [x] Frontend: register/login pages calling the auth API
- [x] Frontend: capture/upload page, photo grid grouped by subject
- [x] Phase 3: Reliability & Offline-First (Rate limiting queue, Error states for every async step)
- [x] Backend tests for auth module
- [x] Phase 4: PWA (installable web app, offline fallback)

## In Progress

## Technical Debt / TODO

- [ ] **GeminiEmbeddingProvider retry logic has no automated test** — the 429 retry
  path (exponential backoff, Retry-After header) was added manually and is only
  verifiable at runtime. A unit test with a mocked RestClient returning 429 should
  be added when time allows. (Added 2026-08-22)

## Not Started

- [ ] Phase 5: Billing/subscription tracking (`subscriptions`, `usage_monthly`)
- [ ] Phase 6: Production Hardening
- [ ] Phase 7: Native Mobile App

## Locked-in Decisions

_(Do not change any of these without proposing the change and getting explicit user confirmation first.)_

- **Repo**: single monorepo, not split repos
- **Backend**: Spring Boot, modular monolith organized by business module (see `.agents/rules/spring-boot-module-structure.md`)
- **Frontend**: Next.js App Router (not Pages Router), TypeScript, Tailwind, PWA support via `@ducanh2912/next-pwa`
- **Database**: PostgreSQL with `pgvector` extension, all primary keys are UUID, all timestamps are `TIMESTAMPTZ`
- **Object storage**: MinIO locally (S3-compatible), real S3 or equivalent in production
- **Auth**: JWT, stored in `httpOnly` cookies (not `localStorage`), access + refresh token pattern
- **Schema migrations**: Flyway, `ddl-auto: validate` (never `update` alongside Flyway)
- **Vector index**: `hnsw`, not `ivfflat` — and no index at all until the table has a realistic amount of data
- **Embedding/LLM provider**: Gemini API (free tier during prototyping; revisit for production quota/billing needs)
- **Git workflow**: human-in-the-loop, AI never commits/pushes without explicit confirmation (see `.agents/rules/git-workflow.md`)

## Full Database Schema

### Module: Auth

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free',
    storage_quota_bytes BIGINT NOT NULL DEFAULT 524288000,
    storage_used_bytes BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Module: Subject

```sql
CREATE TABLE subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description VARCHAR(500),
    color_hex VARCHAR(7) DEFAULT '#4F46E5',
    semester VARCHAR(50),
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subjects_user_id ON subjects(user_id);
```

### Module: Media

```sql
CREATE TABLE media_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(100),
    size_bytes BIGINT NOT NULL,
    caption VARCHAR(500),
    storage_path VARCHAR(500) NOT NULL,
    url VARCHAR(500) NOT NULL,
    ocr_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    ocr_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_user_created_at ON media_files(user_id, created_at DESC);
CREATE INDEX idx_media_subject_created_at ON media_files(subject_id, created_at DESC);
CREATE INDEX idx_media_ocr_status ON media_files(ocr_status) WHERE ocr_status IN ('pending', 'processing', 'failed');
```

### Module: OCR & RAG

```sql
CREATE TABLE ocr_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_id UUID NOT NULL UNIQUE REFERENCES media_files(id) ON DELETE CASCADE,
    raw_text TEXT,
    confidence_score REAL,
    ocr_engine VARCHAR(30) NOT NULL,
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_id UUID NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
    ocr_result_id UUID NOT NULL REFERENCES ocr_results(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_chunk_media_index UNIQUE (media_id, chunk_index)
);

CREATE INDEX idx_chunks_media_id ON document_chunks(media_id);

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE chunk_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id UUID NOT NULL UNIQUE REFERENCES document_chunks(id) ON DELETE CASCADE,
    embedding vector(768) NOT NULL,
    model_name VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chunk_embeddings_chunk_id ON chunk_embeddings(chunk_id);

-- Add HNSW index once the table has a realistic amount of data — see
-- .agents/rules/rag-pipeline.md before adding this.
-- CREATE INDEX idx_chunk_embeddings_vector ON chunk_embeddings
--     USING hnsw (embedding vector_cosine_ops);

CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    title VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE message_citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES media_files(id) ON DELETE CASCADE,
    similarity_score REAL NOT NULL
);

CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX idx_message_citations_message_id ON message_citations(message_id);
```
```

### Module: Billing (schema ready from day one, feature built later)

```sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    payment_provider VARCHAR(30),
    payment_reference VARCHAR(255),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE usage_monthly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year_month VARCHAR(7) NOT NULL,
    photos_uploaded_count INTEGER NOT NULL DEFAULT 0,
    questions_asked_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, year_month)
);
```

## Data Flow Summary

A `user` owns many `subjects`. Each `subject` contains many `photos`. Each
`photo` produces exactly one `ocr_result`, which is split into many
`document_chunks`, each with exactly one `chunk_embedding`. When a user asks
a question in a `chat_session`, the assistant's `chat_message` links to
`message_citations`, each pointing to a `document_chunk` and, through it,
the source `photo`. `subscriptions` and `usage_monthly` track the business
model independently and don't block the core product flow.
