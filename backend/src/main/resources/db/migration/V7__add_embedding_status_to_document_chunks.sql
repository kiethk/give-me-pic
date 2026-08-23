-- Track per-chunk embedding status so failed/pending chunks can be identified
-- and retried via the backfill endpoint without relying on console logs.
-- Values: pending | processing | completed | failed
ALTER TABLE document_chunks
    ADD COLUMN embedding_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    ADD COLUMN embedding_error  TEXT;

CREATE INDEX idx_chunks_embedding_status ON document_chunks (embedding_status)
    WHERE embedding_status IN ('pending', 'failed');
