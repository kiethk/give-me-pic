ALTER TABLE media_files
    ADD COLUMN ocr_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    ADD COLUMN ocr_error TEXT;

CREATE INDEX idx_media_ocr_status
    ON media_files(ocr_status)
    WHERE ocr_status IN ('pending', 'processing', 'failed');

CREATE TABLE ocr_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_id UUID NOT NULL UNIQUE,
    raw_text TEXT,
    confidence_score REAL,
    ocr_engine VARCHAR(30) NOT NULL,
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_ocr_media FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE CASCADE
);

CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_id UUID NOT NULL,
    ocr_result_id UUID NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_chunk_media FOREIGN KEY (media_id) REFERENCES media_files(id) ON DELETE CASCADE,
    CONSTRAINT fk_chunk_ocr_result FOREIGN KEY (ocr_result_id) REFERENCES ocr_results(id) ON DELETE CASCADE,
    CONSTRAINT uq_chunk_media_index UNIQUE (media_id, chunk_index)
);

CREATE INDEX idx_chunks_media_id ON document_chunks(media_id);

CREATE TABLE chunk_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id UUID NOT NULL UNIQUE,
    embedding vector(1536) NOT NULL,
    model_name VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_embedding_chunk FOREIGN KEY (chunk_id) REFERENCES document_chunks(id) ON DELETE CASCADE
);

CREATE INDEX idx_chunk_embeddings_chunk_id ON chunk_embeddings(chunk_id);
