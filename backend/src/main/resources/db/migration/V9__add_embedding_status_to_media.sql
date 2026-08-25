ALTER TABLE media_files
ADD COLUMN embedding_status VARCHAR(20) NOT NULL DEFAULT 'pending',
ADD COLUMN embedding_error TEXT;
